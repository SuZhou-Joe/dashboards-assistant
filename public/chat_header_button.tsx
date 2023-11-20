/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiHeaderSectionItemButton, EuiIcon } from '@elastic/eui';
import classNames from 'classnames';
import React, { useCallback, useMemo, useState } from 'react';
import { useEffectOnce } from 'react-use';
import { ApplicationStart } from '../../../src/core/public';
import { ChatFlyout } from './chat_flyout';
import { ChatContext, IChatContext } from './contexts/chat_context';
import { SetContext } from './contexts/set_context';
import { ChatStateProvider } from './hooks/use_chat_state';
import './index.scss';
import chatIcon from './assets/chat.svg';
import { ActionExecutor, AssistantActions, ContentRenderer, UserAccount, TabId } from './types';

interface HeaderChatButtonProps {
  application: ApplicationStart;
  chatEnabled: boolean;
  contentRenderers: Record<string, ContentRenderer>;
  actionExecutors: Record<string, ActionExecutor>;
  assistantActions: AssistantActions;
  currentAccount: UserAccount;
}

let flyoutLoaded = false;

export const HeaderChatButton: React.FC<HeaderChatButtonProps> = (props) => {
  const [appId, setAppId] = useState<string>();
  const [sessionId, setSessionId] = useState<string>();
  const [title, setTitle] = useState<string>();
  const [flyoutVisible, setFlyoutVisible] = useState(false);
  const [flyoutComponent, setFlyoutComponent] = useState<React.ReactNode | null>(null);
  const [selectedTabId, setSelectedTabId] = useState<TabId>('chat');
  const [preSelectedTabId, setPreSelectedTabId] = useState<TabId | undefined>(undefined);
  const [traceId, setTraceId] = useState<string | undefined>(undefined);
  const [chatSize, setChatSize] = useState<number | 'fullscreen' | 'dock-right'>('dock-right');
  const flyoutFullScreen = chatSize === 'fullscreen';
  const [rootAgentId, setRootAgentId] = useState<string>(
    new URL(window.location.href).searchParams.get('agent_id') || ''
  );

  if (!flyoutLoaded && flyoutVisible) flyoutLoaded = true;

  useEffectOnce(() => {
    const subscription = props.application.currentAppId$.subscribe((id) => setAppId(id));
    return () => subscription.unsubscribe();
  });

  const toggleFlyoutFullScreen = useCallback(() => {
    setChatSize(flyoutFullScreen ? 'dock-right' : 'fullscreen');
  }, [flyoutFullScreen, setChatSize]);

  const chatContextValue: IChatContext = useMemo(
    () => ({
      appId,
      sessionId,
      setSessionId,
      selectedTabId,
      preSelectedTabId,
      setSelectedTabId: (tabId: TabId) => {
        setPreSelectedTabId(selectedTabId);
        setSelectedTabId(tabId);
      },
      flyoutVisible,
      flyoutFullScreen,
      setFlyoutVisible,
      setFlyoutComponent,
      chatEnabled: props.chatEnabled,
      contentRenderers: props.contentRenderers,
      actionExecutors: props.actionExecutors,
      currentAccount: props.currentAccount,
      title,
      setTitle,
      traceId,
      setTraceId,
      rootAgentId,
    }),
    [
      appId,
      sessionId,
      flyoutVisible,
      flyoutFullScreen,
      selectedTabId,
      preSelectedTabId,
      props.chatEnabled,
      props.contentRenderers,
      props.actionExecutors,
      props.currentAccount,
      title,
      setTitle,
      traceId,
      setTraceId,
    ]
  );

  return (
    <>
      <EuiHeaderSectionItemButton
        className={classNames('llm-chat-header-icon-wrapper')}
        onClick={() => setFlyoutVisible(!flyoutVisible)}
      >
        <EuiIcon type={chatIcon} size="l" />
      </EuiHeaderSectionItemButton>
      <ChatContext.Provider value={chatContextValue}>
        <ChatStateProvider>
          <SetContext assistantActions={props.assistantActions} />
          {flyoutLoaded ? (
            <ChatFlyout
              flyoutVisible={flyoutVisible}
              overrideComponent={flyoutComponent}
              flyoutProps={flyoutFullScreen ? { size: '100%' } : {}}
              flyoutFullScreen={flyoutFullScreen}
              toggleFlyoutFullScreen={toggleFlyoutFullScreen}
            />
          ) : null}
        </ChatStateProvider>
      </ChatContext.Provider>
    </>
  );
};
