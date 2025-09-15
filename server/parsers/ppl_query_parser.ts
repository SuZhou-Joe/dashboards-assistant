/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageParser } from '../types';

export const PPLQueryParser: MessageParser = {
  order: 1,
  id: 'ppl_query_message',
  async parserProvider(interaction) {
    if (interaction.additional_info?.['TransferQuestionToPPLAndExecuteTool.output']) {
      return [
        {
          type: 'output',
          contentType: 'pplQueries',
          content: JSON.stringify(
            interaction.additional_info?.['TransferQuestionToPPLAndExecuteTool.output']
          ),
          interactionId: interaction.interaction_id,
        },
      ];
    }
    return [];
  },
};
