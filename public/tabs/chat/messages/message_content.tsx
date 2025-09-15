/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React from 'react';
import { useObservable } from 'react-use';
import rison from 'rison-node';
import { IMessage } from '../../../../common/types/chat_saved_object_attributes';
import { CoreVisualization } from '../../../components/core_visualization';
import { useChatContext } from '../../../contexts/chat_context';
import { BlinkCursor } from '../../../components/blink_cursor';
import { MarkdownWithBlinkCursor } from '../../../components/markdown_with_blink_cursor';
import { useCore } from '../../../contexts';

export interface MessageContentProps {
  message: IMessage;
  loading?: boolean;
}

export const MessageContent: React.FC<MessageContentProps> = React.memo((props) => {
  const chatContext = useChatContext();
  const {
    services: { dataSource, application },
  } = useCore();
  const dataSourceId = useObservable(dataSource.getDataSourceId$());

  switch (props.message.contentType) {
    case 'text':
      return (
        <EuiText style={{ whiteSpace: 'pre-line' }}>
          {props.message.content}
          {props.loading ? <BlinkCursor /> : null}
        </EuiText>
      );

    case 'error':
      return (
        <EuiText color="danger" style={{ whiteSpace: 'pre-line' }}>
          {props.message.content}
        </EuiText>
      );

    case 'markdown':
      return (
        <MarkdownWithBlinkCursor loading={props.loading}>
          {props.message.content}
        </MarkdownWithBlinkCursor>
      );

    case 'pplQueries':
      return (
        <div>
          Recommended diagnostic queries:
          <EuiSpacer size="s" />
          {(JSON.parse(props.message.content) as string[]).map((pplItem) => {
            const parsedPPLItem = JSON.parse(pplItem) as { ppl: string };
            return (
              <>
                <EuiCodeBlock>{parsedPPLItem.ppl}</EuiCodeBlock>
                <EuiSpacer size="s" />
                <EuiFlexGroup>
                  <EuiFlexItem grow />
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      size="s"
                      onClick={() => {
                        const getSourceIndexReg = /^\s*source\=([^\s\|]+)/;
                        const matchResult = parsedPPLItem.ppl.match(getSourceIndexReg);
                        if (matchResult) {
                          const sourceIndex = matchResult[1];
                          const _g = rison.encode({
                            filters: [],
                            refreshInterval: { pause: true, value: 0 },
                            time: { from: 'now-15m', to: 'now' },
                          });
                          const _q = rison.encode({
                            dataset: {
                              dataSource: {
                                id: dataSourceId,
                                title: '1',
                                type: 'DATA_SOURCE',
                              },
                              id: `${dataSourceId}::${sourceIndex}`,
                              isRemoteDataset: false,
                              title: sourceIndex,
                              type: 'INDEXES',
                            },
                            language: 'PPL',
                            query: encodeURIComponent(parsedPPLItem.ppl),
                          });

                          const _a = rison.encode({
                            legacy: {
                              columns: ['_source'],
                              interval: 'auto',
                              isDirty: false,
                              sort: [],
                            },
                            tab: {
                              logs: {},
                              patterns: { patternsField: '%27%27', usingRegexPatterns: false },
                            },
                            ui: { activeTabId: 'logs', showHistogram: true },
                          });

                          const jumpUrl = `_g=${_g}&_q=${_q}&_a=${_a}?_q=${_q}&_a=${_a}&_g=${_g}`;

                          application.navigateToUrl(
                            application.getUrlForApp('explore', {
                              path: `/logs/#${jumpUrl}`,
                            })
                          );
                        }
                      }}
                    >
                      View in Discover logs
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer />
              </>
            );
          })}
        </div>
      );

    case 'visualization':
      return (
        <div className="llm-chat-visualizations">
          <CoreVisualization message={props.message} />
        </div>
      );

    // content types registered by plugins unknown to assistant
    default: {
      const message = props.message as IMessage;
      return (
        chatContext.messageRenderers[message.contentType]?.(message, {
          props,
          chatContext,
        }) ?? null
      );
    }
  }
});
