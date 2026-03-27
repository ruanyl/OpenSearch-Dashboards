/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHeaderSectionItemButton,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiPortal,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { PageAgentCore } from '../agent/page_agent_core';
import type { AgentStatus, AgentStepEvent, HistoricalEvent } from '../../common/types';

// ---------------------------------------------------------------------------
// AgentPanelButton — header button + flyout
// ---------------------------------------------------------------------------

interface AgentPanelProps {
  agentCore: PageAgentCore;
}

export function AgentPanelButton({ agentCore }: AgentPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [history, setHistory] = useState<HistoricalEvent[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [currentActivity, setCurrentActivity] = useState('');
  const [askUserCallback, setAskUserCallback] = useState<((answer: string) => void) | null>(null);
  const [askUserQuestion, setAskUserQuestion] = useState('');
  const [askUserInput, setAskUserInput] = useState('');

  const bodyRef = useRef<HTMLDivElement>(null);

  // ---- Subscribe to PageAgentCore events ----

  useEffect(() => {
    const onStatusChange = () => setStatus(agentCore.status);
    const onHistoryChange = () => setHistory([...agentCore.history]);
    const onActivity = (e: Event) => {
      const activity = (e as CustomEvent).detail;
      if (activity.type === 'thinking') {
        setCurrentActivity('Thinking…');
      } else if (activity.type === 'executing') {
        setCurrentActivity(`Executing ${activity.tool}…`);
      } else if (activity.type === 'executed') {
        setCurrentActivity(`Executed ${activity.tool} (${activity.duration}ms)`);
      } else if (activity.type === 'retrying') {
        setCurrentActivity(`Retrying (${activity.attempt}/${activity.maxAttempts})…`);
      } else if (activity.type === 'error') {
        setCurrentActivity(activity.message);
      }
    };

    agentCore.addEventListener('statuschange', onStatusChange);
    agentCore.addEventListener('historychange', onHistoryChange);
    agentCore.addEventListener('activity', onActivity);

    return () => {
      agentCore.removeEventListener('statuschange', onStatusChange);
      agentCore.removeEventListener('historychange', onHistoryChange);
      agentCore.removeEventListener('activity', onActivity);
    };
  }, [agentCore]);

  // ---- Wire onAskUser ----

  useEffect(() => {
    agentCore.onAskUser = (question: string) =>
      new Promise<string>((resolve) => {
        setAskUserQuestion(question);
        setAskUserCallback(() => (answer: string) => {
          setAskUserQuestion('');
          setAskUserCallback(null);
          setAskUserInput('');
          resolve(answer);
        });
      });

    return () => {
      agentCore.onAskUser = undefined;
    };
  }, [agentCore]);

  // ---- Auto-scroll on new history ----

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [history]);

  // ---- Handlers ----

  const toggleFlyout = useCallback(() => setIsOpen((prev) => !prev), []);
  const closeFlyout = useCallback(() => setIsOpen(false), []);

  const submitTask = useCallback(() => {
    const trimmed = taskInput.trim();
    if (!trimmed || status === 'running') return;
    setTaskInput('');
    agentCore.execute(trimmed);
  }, [taskInput, status, agentCore]);

  const handleTaskKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') submitTask();
    },
    [submitTask]
  );

  const handleStop = useCallback(() => agentCore.stop(), [agentCore]);

  const submitAskUser = useCallback(() => {
    if (askUserCallback) {
      askUserCallback(askUserInput.trim());
    }
  }, [askUserCallback, askUserInput]);

  const handleAskUserKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') submitAskUser();
    },
    [submitAskUser]
  );

  // ---- Derived state ----

  const isRunning = status === 'running';
  const stepCount = history.filter((e) => e.type === 'step').length;
  const lastStep = history.length > 0 ? history[history.length - 1] : null;
  const isDone = lastStep?.type === 'step' && (lastStep as AgentStepEvent).action.name === 'done';

  // ---- Status color ----

  const statusColor =
    status === 'running'
      ? 'default'
      : status === 'completed'
      ? 'secondary'
      : status === 'error'
      ? 'danger'
      : 'subdued';

  // ---- Render ----

  return (
    <Fragment>
      <EuiHeaderSectionItemButton
        aria-label="Page Agent"
        aria-expanded={isOpen}
        data-test-subj="osdPageAgentHeaderButton"
        onClick={toggleFlyout}
      >
        <EuiIcon type="machineLearningApp" size="m" />
      </EuiHeaderSectionItemButton>

      {isOpen && (
        <EuiPortal>
          <EuiFlyout
            type="push"
            ownFocus
            size="s"
            onClose={closeFlyout}
            aria-labelledby="pageAgentFlyoutTitle"
            data-test-subj="osdPageAgentFlyout"
          >
            <EuiFlyoutHeader hasBorder>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="s">
                    <h2 id="pageAgentFlyoutTitle">Page Agent</h2>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color={statusColor}>
                    {status}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlyoutHeader>

            <EuiFlyoutBody>
              <div ref={bodyRef}>
                {/* Conversation history */}
                {history.map((event, idx) => {
                  if (event.type === 'step') {
                    const step = event as AgentStepEvent;
                    return (
                      <Fragment key={idx}>
                        <EuiPanel paddingSize="s" hasBorder>
                          <EuiText size="xs">
                            {step.reflection.evaluation_previous_goal && (
                              <p>
                                <strong>Evaluation:</strong>{' '}
                                {step.reflection.evaluation_previous_goal}
                              </p>
                            )}
                            {step.reflection.memory && (
                              <p>
                                <strong>Memory:</strong> {step.reflection.memory}
                              </p>
                            )}
                            {step.reflection.next_goal && (
                              <p>
                                <strong>Next goal:</strong> {step.reflection.next_goal}
                              </p>
                            )}
                            <p>
                              <strong>Action:</strong> {step.action.name}
                            </p>
                            {step.action.output && (
                              <p>
                                <strong>Result:</strong> {step.action.output}
                              </p>
                            )}
                          </EuiText>
                        </EuiPanel>
                        <EuiSpacer size="s" />
                      </Fragment>
                    );
                  }

                  if (event.type === 'observation') {
                    return (
                      <Fragment key={idx}>
                        <EuiCallOut size="s" color="primary" iconType="iInCircle">
                          <EuiText size="xs">{event.content}</EuiText>
                        </EuiCallOut>
                        <EuiSpacer size="s" />
                      </Fragment>
                    );
                  }

                  if (event.type === 'error') {
                    return (
                      <Fragment key={idx}>
                        <EuiCallOut size="s" color="danger" iconType="alert" title="Error">
                          <EuiText size="xs">{event.message}</EuiText>
                        </EuiCallOut>
                        <EuiSpacer size="s" />
                      </Fragment>
                    );
                  }

                  return null;
                })}

                {/* Done display */}
                {isDone && lastStep?.type === 'step' && (
                  <EuiCallOut size="s" color="success" iconType="check" title="Done">
                    <EuiText size="xs">
                      {(lastStep as AgentStepEvent).action.input?.text || 'Task completed'}
                    </EuiText>
                  </EuiCallOut>
                )}

                {/* Ask user */}
                {askUserQuestion && (
                  <Fragment>
                    <EuiSpacer size="s" />
                    <EuiCallOut
                      size="s"
                      color="warning"
                      iconType="questionInCircle"
                      title="Agent asks"
                    >
                      <EuiText size="xs">{askUserQuestion}</EuiText>
                      <EuiSpacer size="xs" />
                      <EuiFlexGroup gutterSize="s" responsive={false}>
                        <EuiFlexItem>
                          <EuiFieldText
                            compressed
                            placeholder="Your answer…"
                            value={askUserInput}
                            onChange={(e) => setAskUserInput(e.target.value)}
                            onKeyDown={handleAskUserKeyDown}
                            data-test-subj="osdPageAgentAskUserInput"
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButton size="s" onClick={submitAskUser}>
                            Reply
                          </EuiButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiCallOut>
                  </Fragment>
                )}
              </div>
            </EuiFlyoutBody>

            <EuiFlyoutFooter>
              {/* Status bar */}
              {isRunning && (
                <Fragment>
                  <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiLoadingSpinner size="s" />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs">Step {stepCount}</EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs" color="subdued">
                        {currentActivity}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="s" />
                </Fragment>
              )}

              {/* Input + buttons */}
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem>
                  <EuiFieldText
                    compressed
                    placeholder="Describe a task…"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    onKeyDown={handleTaskKeyDown}
                    disabled={isRunning}
                    data-test-subj="osdPageAgentTaskInput"
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    size="s"
                    fill
                    onClick={submitTask}
                    disabled={isRunning || !taskInput.trim()}
                    data-test-subj="osdPageAgentSendButton"
                  >
                    Send
                  </EuiButton>
                </EuiFlexItem>
                {isRunning && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="s"
                      color="danger"
                      onClick={handleStop}
                      data-test-subj="osdPageAgentStopButton"
                    >
                      Stop
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlyoutFooter>
          </EuiFlyout>
        </EuiPortal>
      )}
    </Fragment>
  );
}

// ---------------------------------------------------------------------------
// mountAgentPanelButton — for core.chrome.navControls.registerRight()
// ---------------------------------------------------------------------------

export function mountAgentPanelButton(agentCore: PageAgentCore) {
  return (element: HTMLElement) => {
    const root = createRoot(element);
    root.render(<AgentPanelButton agentCore={agentCore} />);
    return () => root.unmount();
  };
}
