/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiResponse } from '@opensearch-project/opensearch';
import { Stream } from 'stream';
import { OpenSearchClient } from '../../../../../src/core/server';
import { IMessage, IInput, Interaction } from '../../../common/types/chat_saved_object_attributes';
import { ChatService } from './chat_service';
import { ML_COMMONS_BASE_API, ROOT_AGENT_CONFIG_ID } from '../../utils/constants';
import { getAgentIdByConfigName } from '../../routes/get_agent';
import { streamSerializer } from '../../../common/utils/stream/serializer';
import { AgentFrameworkStorageService } from '../storage/agent_framework_storage_service';

interface AgentRunPayload {
  question?: string;
  verbose?: boolean;
  memory_id?: string;
  regenerate_interaction_id?: string;
  'prompt.prefix'?: string;
}

const MEMORY_ID_FIELD = 'memory_id';
const INTERACTION_ID_FIELDS = ['parent_message_id', 'parent_interaction_id'];

export class OllyChatService implements ChatService {
  static abortControllers: Map<string, AbortController> = new Map();

  constructor(
    private readonly opensearchClientTransport: OpenSearchClient['transport'],
    private readonly agentFrameworkStorageService: AgentFrameworkStorageService
  ) {}

  private async getRootAgent(): Promise<string> {
    return await getAgentIdByConfigName(ROOT_AGENT_CONFIG_ID, this.opensearchClientTransport);
  }

  private async requestAgentRun(payload: AgentRunPayload) {
    if (payload.memory_id) {
      OllyChatService.abortControllers.set(payload.memory_id, new AbortController());
    }

    const rootAgentId = await this.getRootAgent();
    return await this.callExecuteAgentAPI(payload, rootAgentId);
  }

  private async callExecuteAgentAPI(payload: AgentRunPayload, rootAgentId: string) {
    try {
      const agentFrameworkResponse = (await this.opensearchClientTransport.request(
        {
          method: 'POST',
          path: `${ML_COMMONS_BASE_API}/agents/${rootAgentId}/_execute`,
          body: {
            parameters: payload,
          },
        },
        {
          /**
           * It is time-consuming for LLM to generate final answer
           * Give it a large timeout window
           */
          requestTimeout: 5 * 60 * 1000,
          /**
           * Do not retry
           */
          maxRetries: 0,
        }
      )) as ApiResponse<{
        inference_results: Array<{
          output: Array<{ name: string; result?: string }>;
        }>;
      }>;
      const outputBody = agentFrameworkResponse.body.inference_results?.[0]?.output;
      const conversationIdItem = outputBody?.find((item) => item.name === MEMORY_ID_FIELD);
      const interactionIdItem = outputBody?.find((item) =>
        INTERACTION_ID_FIELDS.includes(item.name)
      );
      return {
        /**
         * Interactions will be stored in Agent framework,
         * thus we do not need to return the latest message back.
         */
        messages: [],
        conversationId: conversationIdItem?.result || '',
        interactionId: interactionIdItem?.result || '',
      };
    } catch (error) {
      throw error;
    } finally {
      if (payload.memory_id) {
        OllyChatService.abortControllers.delete(payload.memory_id);
      }
    }
  }

  async requestLLM(payload: { messages: IMessage[]; input: IInput; conversationId?: string }) {
    const { input, conversationId } = payload;

    let llmInput = input.content;
    if (input.context?.content) {
      llmInput = `Based on the context: ${input.context?.content}, answer question: ${input.content}`;
    }
    const parametersPayload: Pick<
      AgentRunPayload,
      'question' | 'verbose' | 'memory_id' | 'prompt.prefix'
    > = {
      question: llmInput,
      verbose: false,
    };

    if (input.promptPrefix) {
      parametersPayload['prompt.prefix'] = input.promptPrefix;
    }

    if (conversationId) {
      parametersPayload.memory_id = conversationId;
    }

    const stream = new Stream.PassThrough();

    const interactionId = Date.now();

    // const outputs = await this.requestAgentRun(parametersPayload);

    // const generateInteractionsAndMessages = async (interaction: Partial<Interaction>) => {
    //   const interactions = [
    //     {
    //       response: '',
    //       ...interaction,
    //       input: input.content,
    //       conversation_id: outputs.conversationId,
    //       interaction_id: outputs.interactionId,
    //       create_time: new Date().toISOString(),
    //     },
    //   ];

    //   const messages = await this.agentFrameworkStorageService.getMessagesFromInteractions(
    //     interactions
    //   );

    //   return {
    //     interactions,
    //     messages,
    //   };
    // };

    process.nextTick(async () => {
      try {
        const content = 'Hello there, this is hyberlink: [hi](http://www.baidu.com)';
        const batches = [];

        stream.write(
          streamSerializer({
            event: 'metadata',
            data: {
              interactions: [
                {
                  input: input.content,
                  response: '',
                  conversation_id: conversationId as string,
                  interaction_id: '' + interactionId,
                  create_time: new Date().toISOString(),
                },
              ],
              messages: [
                {
                  ...input,
                  messageId: `${interactionId}_0`,
                },
                {
                  type: 'output',
                  contentType: 'markdown',
                  content: '',
                  messageId: `${interactionId}_1`,
                },
              ],
              conversationId,
            },
          })
        );

        for (let i = 0; i < content.length; i += 2) {
          batches.push(content.substring(i, i + 2));
        }
        for (const res of batches) {
          stream.write(
            streamSerializer({
              event: 'appendMessageContent',
              data: {
                messageId: `${interactionId}_1`,
                content: res,
              },
            })
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        stream.end();
      } catch (error) {
        stream.write(
          streamSerializer({
            event: 'error',
            data: error.message || error,
          })
        );
        stream.end();
      }
    });

    return {
      messages: [],
      conversationId,
      interactionId,
      stream,
    };
  }

  async regenerate(payload: {
    conversationId: string;
    interactionId: string;
  }): Promise<{ messages: IMessage[]; conversationId: string; interactionId: string }> {
    const { conversationId, interactionId } = payload;
    const parametersPayload: Pick<
      AgentRunPayload,
      'regenerate_interaction_id' | 'verbose' | 'memory_id'
    > = {
      memory_id: conversationId,
      regenerate_interaction_id: interactionId,
      verbose: false,
    };

    return await this.requestAgentRun(parametersPayload);
  }

  abortAgentExecution(conversationId: string) {
    if (OllyChatService.abortControllers.has(conversationId)) {
      OllyChatService.abortControllers.get(conversationId)?.abort();
    }
  }
}
