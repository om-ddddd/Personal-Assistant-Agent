import {
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { SystemMessage, HumanMessage, AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { model } from "./models.js";
import { basicTools } from "./tools/basic.js";
import crypto from "crypto";

const SYSTEM_PROMPT = `You are an expert Developer Personal Assistant Agent.
You assist developers with:
1. Code analysis, refactoring, and debugging.
2. Architecture design and implementation planning.
3. Git workflow, issue tracking, and PR reviews.
4. Explaining tools and executing system tasks.

You have access to tools such as calculator and get_time. Always use the appropriate tool when calculations or date/time queries are requested.

Always provide concise, clear, and high-quality technical answers.
Do not use emojis in your responses.`;

/**
 * Thread Metadata representation for session tracking
 */
export interface ThreadMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * In-memory thread registry (ready to be swapped with PostgreSQL / Prisma in Phase 1)
 */
const threadStore = new Map<string, ThreadMetadata>();

/**
 * List all active thread sessions, ordered by most recently updated
 */
export function listThreads(): ThreadMetadata[] {
  return Array.from(threadStore.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Create a new distinct thread session with a unique UUID
 */
export function createThread(initialTitle: string = "New Conversation"): ThreadMetadata {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const thread: ThreadMetadata = {
    id,
    title: initialTitle,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
  threadStore.set(id, thread);
  return thread;
}

/**
 * Get thread metadata by ID
 */
export function getThread(id: string): ThreadMetadata | undefined {
  return threadStore.get(id);
}

/**
 * Delete a thread session from the registry
 */
export function deleteThread(id: string): boolean {
  return threadStore.delete(id);
}

/**
 * Touch a thread to increment message count, refresh timestamp, and generate title from first prompt
 */
export function touchThread(id: string, prompt?: string): ThreadMetadata {
  let thread = threadStore.get(id);
  const now = new Date().toISOString();

  if (!thread) {
    let title = "New Conversation";
    if (prompt && prompt.trim()) {
      const clean = prompt.trim();
      title = clean.length > 36 ? clean.slice(0, 36) + "..." : clean;
    }
    thread = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messageCount: 1,
    };
    threadStore.set(id, thread);
    return thread;
  }

  thread.messageCount += 1;
  thread.updatedAt = now;

  if (thread.title === "New Conversation" && prompt && prompt.trim()) {
    const clean = prompt.trim();
    thread.title = clean.length > 36 ? clean.slice(0, 36) + "..." : clean;
  }

  threadStore.set(id, thread);
  return thread;
}

/**
 * Bind available tools to the LLM
 */
export const modelWithTools = model.bindTools(basicTools);

/**
 * Tool execution node powered by LangGraph ToolNode
 */
export const toolNode = new ToolNode(basicTools);

/**
 * Core reasoning node that invokes the active model with conversation state and tool binding.
 */
async function callModel(state: typeof MessagesAnnotation.State) {
  const messagesWithSystem: BaseMessage[] = [
    new SystemMessage(SYSTEM_PROMPT),
    ...state.messages,
  ];

  const response = await modelWithTools.invoke(messagesWithSystem);
  return { messages: [response] };
}

/**
 * LangGraph Agent StateGraph workflow with ToolNode & Conditional Routing
 */
const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition)
  .addEdge("tools", "agent");

/**
 * In-memory checkpointer for multi-turn thread retention
 */
export const checkpointer = new MemorySaver();

/**
 * Compiled LangGraph Agent
 */
export const agent = workflow.compile({
  checkpointer,
});

/**
 * Roll back thread state in MemorySaver checkpointer to targetMessages
 */
export async function rewindThreadState(threadId: string, targetMessages: BaseMessage[]) {
  const config = { configurable: { thread_id: threadId } };

  if (checkpointer && (checkpointer as any).storage) {
    const storage = (checkpointer as any).storage;
    if (typeof storage.delete === "function") {
      storage.delete(threadId);
    } else if (storage[threadId]) {
      delete storage[threadId];
    }
  }

  if (targetMessages.length > 0) {
    await (checkpointer as any).put(
      config,
      {
        v: 1,
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        channel_values: { messages: targetMessages },
        channel_versions: { messages: 1 },
        versions_seen: {},
      },
      {}
    );
  }
}

/**
 * Format markdown tool card for persistent history and stream
 */
function formatToolCard(toolName: string, input: any, output: any): string {
  const inputStr = typeof input === "string" ? input : JSON.stringify(input);
  let outputDisplay = typeof output === "string" ? output : JSON.stringify(output);
  try {
    const parsed = JSON.parse(outputDisplay);
    if (parsed.result !== undefined) {
      outputDisplay = `${parsed.result}`;
    } else if (parsed.currentTime !== undefined) {
      outputDisplay = `${parsed.currentTime} (${parsed.timezone})`;
    }
  } catch {
    // keep raw
  }

  return `> **Tool Executed: \`${toolName}\`**  \n> - **Parameters**: \`${inputStr}\`  \n> - **Result**: \`${outputDisplay}\`\n\n---`;
}

/**
 * Retrieve thread state history from LangGraph checkpointer with formatted tool execution cards
 */
export async function getThreadHistory(threadId: string) {
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  const state = await agent.getState(config);
  if (!state || !state.values || !state.values.messages) {
    return [];
  }

  const rawMessages: BaseMessage[] = state.values.messages;
  const history: Array<{ id: string; role: "user" | "assistant"; content: string }> = [];

  let pendingToolCards: string[] = [];
  const pendingToolCallsMap = new Map<string, { name: string; args: any }>();

  for (const m of rawMessages) {
    const isHuman = m instanceof HumanMessage || (typeof m.getType === "function" && m.getType() === "human");
    const isAI = m instanceof AIMessage || (typeof m.getType === "function" && m.getType() === "ai");
    const isTool = m instanceof ToolMessage || (typeof m.getType === "function" && m.getType() === "tool");

    if (isHuman) {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (text.trim()) {
        history.push({
          id: m.id || crypto.randomUUID(),
          role: "user",
          content: text,
        });
      }
      pendingToolCards = [];
      pendingToolCallsMap.clear();
    } else if (isAI) {
      const aiMsg = m as AIMessage;
      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        for (const tc of aiMsg.tool_calls) {
          const callId = tc.id || tc.name;
          pendingToolCallsMap.set(callId, { name: tc.name, args: tc.args });
        }
      }

      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (text.trim()) {
        const fullContent = pendingToolCards.length > 0
          ? `${pendingToolCards.join("\n\n")}\n\n${text}`
          : text;

        history.push({
          id: m.id || crypto.randomUUID(),
          role: "assistant",
          content: fullContent,
        });
        pendingToolCards = [];
        pendingToolCallsMap.clear();
      }
    } else if (isTool) {
      const toolMsg = m as ToolMessage;
      const callId = (toolMsg.tool_call_id || toolMsg.name || "tool") as string;
      const tc = pendingToolCallsMap.get(callId) || { name: toolMsg.name || "tool", args: {} };
      const card = formatToolCard(tc.name, tc.args, toolMsg.content);
      pendingToolCards.push(card);
    }
  }

  if (pendingToolCards.length > 0) {
    history.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: pendingToolCards.join("\n\n"),
    });
  }

  return history;
}

/**
 * Helper to invoke the agent for a given thread
 */
export async function invokeAgent(prompt: string, threadId: string = "default-thread") {
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Regeneration detection
  const state = await agent.getState(config);
  if (state && state.values && state.values.messages && state.values.messages.length > 0) {
    const currentMsgs: BaseMessage[] = state.values.messages;
    let lastHumanIdx = -1;
    for (let i = currentMsgs.length - 1; i >= 0; i--) {
      const m = currentMsgs[i];
      const isHuman = m instanceof HumanMessage || (typeof m.getType === "function" && m.getType() === "human");
      if (isHuman) {
        lastHumanIdx = i;
        break;
      }
    }

    if (lastHumanIdx !== -1) {
      const lastHuman = currentMsgs[lastHumanIdx];
      const lastText = typeof lastHuman.content === "string" ? lastHuman.content : JSON.stringify(lastHuman.content);
      if (lastText.trim() === prompt.trim()) {
        const rewound = currentMsgs.slice(0, lastHumanIdx);
        await rewindThreadState(threadId, rewound);
      }
    }
  }

  touchThread(threadId, prompt);

  const result = await agent.invoke(
    {
      messages: [new HumanMessage(prompt)],
    },
    config
  );

  const lastMessage = result.messages[result.messages.length - 1];
  const toolMessages = result.messages.filter((m: BaseMessage) => m instanceof ToolMessage);

  return {
    content: typeof lastMessage.content === "string" ? lastMessage.content : JSON.stringify(lastMessage.content),
    messages: result.messages,
    toolCallsCount: toolMessages.length,
    toolMessages,
  };
}

/**
 * Helper to stream raw token chunks and tool events from LangGraph using streamEvents
 */
export async function* streamAgentEvents(prompt: string, threadId: string = "default-thread") {
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Regeneration detection: if last human message is identical to incoming prompt, rewind previous turn
  const state = await agent.getState(config);
  if (state && state.values && state.values.messages && state.values.messages.length > 0) {
    const currentMsgs: BaseMessage[] = state.values.messages;
    let lastHumanIdx = -1;
    for (let i = currentMsgs.length - 1; i >= 0; i--) {
      const m = currentMsgs[i];
      const isHuman = m instanceof HumanMessage || (typeof m.getType === "function" && m.getType() === "human");
      if (isHuman) {
        lastHumanIdx = i;
        break;
      }
    }

    if (lastHumanIdx !== -1) {
      const lastHuman = currentMsgs[lastHumanIdx];
      const lastText = typeof lastHuman.content === "string" ? lastHuman.content : JSON.stringify(lastHuman.content);
      if (lastText.trim() === prompt.trim()) {
        const rewound = currentMsgs.slice(0, lastHumanIdx);
        await rewindThreadState(threadId, rewound);
      }
    }
  }

  touchThread(threadId, prompt);

  const eventStream = agent.streamEvents(
    {
      messages: [new HumanMessage(prompt)],
    },
    {
      ...config,
      version: "v2",
    }
  );

  for await (const event of eventStream) {
    if (event.event === "on_chat_model_stream" && event.data?.chunk) {
      const chunk = event.data.chunk;
      let text = "";
      if (typeof chunk.content === "string") {
        text = chunk.content;
      } else if (Array.isArray(chunk.content)) {
        text = chunk.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join("");
      }
      if (text) {
        yield { type: "text", text };
      }
    } else if (event.event === "on_tool_start") {
      let rawInput = event.data?.input;
      if (rawInput && typeof rawInput.input === "string") {
        try {
          rawInput = JSON.parse(rawInput.input);
        } catch {
          rawInput = rawInput.input;
        }
      }
      yield {
        type: "tool_start",
        tool: event.name,
        input: rawInput,
      };
    } else if (event.event === "on_tool_end") {
      let rawOutput = event.data?.output;
      if (rawOutput && typeof rawOutput === "object" && "content" in rawOutput) {
        rawOutput = rawOutput.content;
      }
      const outputStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
      yield {
        type: "tool_end",
        tool: event.name,
        output: outputStr,
      };
    }
  }
}

export async function saveGraphImage(filename = "graph.png"): Promise<void> {
  const fs = await import("node:fs/promises");
  const graph = await agent.getGraphAsync();
  const blob = await graph.drawMermaidPng();
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(filename, buffer);
  console.log(`Graph diagram saved to: ${filename}`);
}
