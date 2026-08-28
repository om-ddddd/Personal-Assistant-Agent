"use client";

import { useLocalRuntime, type ChatModelAdapter, type ThreadMessageLike } from "@assistant-ui/react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getStoredAuthToken } from "./user-auth";

export type ToolRiskLevel = "READ" | "WRITE" | "DESTRUCTIVE";

export interface ToolPermissionEntry {
  toolName: string;
  riskLevel: ToolRiskLevel;
  description: string;
}

export interface PermissionRegistryResponse {
  tools: ToolPermissionEntry[];
  summary: Record<ToolRiskLevel, string[]>;
  total: number;
}

export interface PendingConfirmation {
  id: string;
  threadId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskLevel: ToolRiskLevel;
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  createdAt: string;
  resolvedAt?: string;
}

export interface ThreadInterruptState {
  threadId: string;
  interrupted: boolean;
  payload: Array<{
    type: "confirmation_required";
    tools: Array<{
      name: string;
      args: Record<string, unknown>;
      callId: string;
      riskLevel: ToolRiskLevel;
    }>;
    message: string;
  }> | null;
}

export interface ThreadSession {
  id: string;
  userId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ThreadHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface BackendRuntimeOptions {
  threadId: string;
  backendUrl?: string;
  initialMessages?: readonly ThreadMessageLike[];
  onStreamComplete?: () => void;
  onInterruptDetected?: (interruptState: ThreadInterruptState) => void;
}

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch all active thread sessions from the backend scoped to current user
 */
export async function fetchThreads(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<ThreadSession[]> {
  try {
    const res = await fetch(`${backendUrl}/api/threads`, {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.threads || [];
  } catch (err) {
    console.error("Failed to fetch threads from backend:", err);
    return [];
  }
}

/**
 * Fetch conversation history for a specific thread
 */
export async function fetchThreadHistory(
  threadId: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<ThreadHistoryMessage[]> {
  try {
    const res = await fetch(
      `${backendUrl}/api/threads/${encodeURIComponent(threadId)}/history`,
      {
        method: "GET",
        headers: {
          ...getAuthHeaders(),
        },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    console.error("Failed to fetch thread history from backend:", err);
    return [];
  }
}

/**
 * Create a new distinct thread session on the backend (backend-generated UUID)
 */
export async function createThreadOnBackend(
  backendUrl: string = DEFAULT_BACKEND_URL,
  title: string = "New Conversation"
): Promise<ThreadSession | null> {
  try {
    const res = await fetch(`${backendUrl}/api/threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.thread || null;
  } catch (err) {
    console.error("Failed to create thread on backend:", err);
    return null;
  }
}

/**
 * Delete a thread session from the backend
 */
export async function deleteThreadOnBackend(
  threadId: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}/api/threads/${encodeURIComponent(threadId)}`, {
      method: "DELETE",
      headers: {
        ...getAuthHeaders(),
      },
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to delete thread on backend:", err);
    return false;
  }
}

/**
 * Fetch full tool permission registry from the backend
 */
export async function fetchPermissionRegistry(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<PermissionRegistryResponse | null> {
  try {
    const res = await fetch(`${backendUrl}/api/permissions/registry`, {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch permission registry:", err);
    return null;
  }
}

/**
 * Fetch all pending confirmations across threads
 */
export async function fetchPendingConfirmations(
  threadId?: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<PendingConfirmation[]> {
  try {
    const url = threadId
      ? `${backendUrl}/api/permissions/pending?threadId=${encodeURIComponent(threadId)}`
      : `${backendUrl}/api/permissions/pending`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.pending || [];
  } catch (err) {
    console.error("Failed to fetch pending confirmations:", err);
    return [];
  }
}

/**
 * Check if a thread is currently in interrupted (waiting for HITL approval) state
 */
export async function checkThreadInterrupt(
  threadId: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<ThreadInterruptState | null> {
  try {
    const res = await fetch(`${backendUrl}/api/threads/${encodeURIComponent(threadId)}/interrupt`, {
      method: "GET",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Failed to check thread interrupt state:", err);
    return null;
  }
}

/**
 * Submit user decision (Approve / Reject) for a paused thread
 */
export async function confirmToolExecution(
  threadId: string,
  approved: boolean,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<{ content?: string; error?: string }> {
  try {
    const res = await fetch(`${backendUrl}/api/permissions/confirm/${encodeURIComponent(threadId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || `HTTP error ${res.status}` };
    }
    return { content: data.content };
  } catch (err: unknown) {
    const error = err as Error;
    return { error: error.message || "Failed to confirm execution." };
  }
}

/**
 * Creates a ChatModelAdapter connected to the Express + LangGraph backend
 * with real-time SSE streaming, tool call execution displays, HITL confirmation detection, and error fallbacks.
 */
export function createBackendChatModel(
  threadId: string,
  backendUrl: string = DEFAULT_BACKEND_URL,
  onStreamComplete?: () => void,
  onInterruptDetected?: (interruptState: ThreadInterruptState) => void
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const lastMessage = messages[messages.length - 1];
      const userText =
        lastMessage?.content
          ?.map((c) => (c.type === "text" ? c.text : ""))
          .join(" ")
          .trim() || "";

      if (!userText) {
        yield {
          content: [
            {
              type: "text" as const,
              text: "Please enter a message.",
            },
          ],
        };
        return;
      }

      let accumulatedText = "";
      const activeToolInputMap: Record<string, string> = {};

      try {
        const response = await fetch(`${backendUrl}/api/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            message: userText,
            threadId,
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          throw new Error(`Backend server returned HTTP status ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No readable response body received from backend stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const dataStr = trimmed.replace(/^data:\s*/, "");
            if (dataStr === "[DONE]") {
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                accumulatedText += `\n\n**Agent Error**: ${parsed.error}`;
                yield {
                  content: [
                    {
                      type: "text" as const,
                      text: accumulatedText,
                    },
                  ],
                };
              } else if (parsed.type === "confirmation_required") {
                // HITL confirmation requested by permission gate
                const payload = parsed.payload;
                let toolName = "tool";
                let riskLevel: ToolRiskLevel = "WRITE";
                let toolArgs = "{}";

                if (Array.isArray(payload) && payload.length > 0 && payload[0].tools?.length > 0) {
                  const firstTool = payload[0].tools[0];
                  toolName = firstTool.name;
                  riskLevel = firstTool.riskLevel || "WRITE";
                  toolArgs = typeof firstTool.args === "string" ? firstTool.args : JSON.stringify(firstTool.args);
                }

                const confirmationBlock =
                  `\n\n> **Confirmation Required: \`${toolName}\`**  \n` +
                  `> - **Risk Level**: \`${riskLevel}\`  \n` +
                  `> - **Parameters**: \`${toolArgs}\`  \n` +
                  `> - **Thread ID**: \`${threadId}\`  \n` +
                  `> - **Status**: \`Awaiting Approval\`\n\n`;

                accumulatedText += confirmationBlock;

                yield {
                  content: [
                    {
                      type: "text" as const,
                      text: accumulatedText,
                    },
                  ],
                };

                onInterruptDetected?.({
                  threadId,
                  interrupted: true,
                  payload,
                });
              } else if (parsed.type === "tool_start") {
                const inputStr = typeof parsed.input === "string" ? parsed.input : JSON.stringify(parsed.input);
                activeToolInputMap[parsed.tool] = inputStr;

                const startBlock = `> **Tool Executed: \`${parsed.tool}\`**  \n> - **Parameters**: \`${inputStr}\`  \n> - **Status**: \`Executing...\`\n\n`;

                accumulatedText += `\n\n${startBlock}\n\n`;
                yield {
                  content: [
                    {
                      type: "text" as const,
                      text: accumulatedText,
                    },
                  ],
                };
              } else if (parsed.type === "tool_end") {
                let outputDisplay = parsed.output;
                try {
                  const parsedObj = JSON.parse(parsed.output);
                  if (parsedObj.result !== undefined) {
                    outputDisplay = `${parsedObj.result}`;
                  } else if (parsedObj.currentTime !== undefined) {
                    outputDisplay = `${parsedObj.currentTime} (${parsedObj.timezone})`;
                  }
                } catch {
                  // use raw outputDisplay
                }

                const inputStr = activeToolInputMap[parsed.tool] || "{}";
                const completedBlock = `> **Tool Executed: \`${parsed.tool}\`**  \n> - **Parameters**: \`${inputStr}\`  \n> - **Result**: \`${outputDisplay}\`\n\n`;

                if (accumulatedText.includes('`Executing...`')) {
                  accumulatedText = accumulatedText.replace(
                    new RegExp(`> \\*\\*Tool Executed: \`${parsed.tool}\`\\*\\*[\\s\\S]*?> - \\*\\*Status\\*\\*: \`Executing\\.\\.\\.\``, 'g'),
                    completedBlock
                  );
                } else {
                  accumulatedText += `\n\n${completedBlock}\n\n`;
                }

                yield {
                  content: [
                    {
                      type: "text" as const,
                      text: accumulatedText,
                    },
                  ],
                };
              } else if (parsed.type === "text" || parsed.text) {
                accumulatedText += parsed.text;
                yield {
                  content: [
                    {
                      type: "text" as const,
                      text: accumulatedText,
                    },
                  ],
                };
              }
            } catch {
              // Ignore partial JSON parse errors in stream
            }
          }
        }

        // Final flush
        if (accumulatedText) {
          yield {
            content: [
              {
                type: "text" as const,
                text: accumulatedText,
              },
            ],
          };
        }

        onStreamComplete?.();
      } catch (err: unknown) {
        if (abortSignal.aborted) {
          return;
        }

        const error = err as Error;
        const errorMessage =
          `**Connection Error**: Unable to communicate with the LangGraph Backend at \`${backendUrl}\`.\n\n` +
          `**Details**: ${error.message || "Network request failed"}\n\n` +
          `**Troubleshooting Steps**:\n` +
          `1. Verify the backend server is running: \`cd backend && npm run dev\`\n` +
          `2. Check that the backend port is accessible at \`${backendUrl}/health\`\n` +
          `3. Verify \`NVIDIA_API_KEY\` or \`GROQ_API_KEY\` is configured in \`backend/.env\``;

        yield {
          content: [
            {
              type: "text" as const,
              text: errorMessage,
            },
          ],
        };
      }
    },
  };
}

/**
 * Hook providing a live assistant runtime wired to the LangGraph backend.
 */
export function useBackendRuntime({
  threadId,
  backendUrl = DEFAULT_BACKEND_URL,
  initialMessages,
  onStreamComplete,
  onInterruptDetected,
}: BackendRuntimeOptions) {
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/health`, { method: "GET" });
      if (res.ok) {
        setIsBackendHealthy(true);
      } else {
        setIsBackendHealthy(false);
      }
    } catch {
      setIsBackendHealthy(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const adapter = useMemo(
    () => createBackendChatModel(threadId, backendUrl, onStreamComplete, onInterruptDetected),
    [threadId, backendUrl, onStreamComplete, onInterruptDetected]
  );

  const runtime = useLocalRuntime(adapter, { initialMessages });

  return {
    runtime,
    isBackendHealthy,
    checkHealth,
  };
}
