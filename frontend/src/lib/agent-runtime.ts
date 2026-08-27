"use client";

import { useLocalRuntime, type ChatModelAdapter, type ThreadMessageLike } from "@assistant-ui/react";
import { useState, useEffect, useCallback, useMemo } from "react";

export interface ThreadSession {
  id: string;
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
}

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

/**
 * Fetch all active thread sessions from the backend
 */
export async function fetchThreads(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<ThreadSession[]> {
  try {
    const res = await fetch(`${backendUrl}/api/threads`, { method: "GET" });
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
      { method: "GET" }
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
      headers: { "Content-Type": "application/json" },
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
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to delete thread on backend:", err);
    return false;
  }
}

/**
 * Creates a ChatModelAdapter connected to the Express + LangGraph backend
 * with real-time SSE streaming, tool call execution displays, and error fallbacks.
 */
export function createBackendChatModel(
  threadId: string,
  backendUrl: string = DEFAULT_BACKEND_URL,
  onStreamComplete?: () => void
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
          `3. Verify \`GROQ_API_KEY\` is configured in \`backend/.env\``;

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
    () => createBackendChatModel(threadId, backendUrl, onStreamComplete),
    [threadId, backendUrl, onStreamComplete]
  );

  const runtime = useLocalRuntime(adapter, { initialMessages });

  return {
    runtime,
    isBackendHealthy,
    checkHealth,
  };
}
