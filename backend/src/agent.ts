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
import { initializeMcpClient, getLoadedMcpTools } from "./mcp/client.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import crypto from "crypto";

const SYSTEM_PROMPT = `You are an expert Developer Personal Assistant Agent.
You assist developers with:
1. Navigating and managing the workspace filesystem via Filesystem MCP tools (read_text_file, list_directory, search_files, write_file, edit_file, etc.).
2. Mathematical calculations (calculator) and system time queries (get_time).
3. GitHub repository operations and code reviews via GitHub MCP tools and list_my_github_repositories.
4. Analyzing, refactoring, and debugging source code.

When the user asks to inspect, read, search, or list files in the project or workspace, ALWAYS use the appropriate Filesystem MCP tool.
When the user asks to list, inspect, or describe their own GitHub repositories, ALWAYS use the list_my_github_repositories tool.

Formatting Guidelines:
- When presenting tabular data, ensure every Markdown table row is on its own separate line with standard newlines (never combine multiple rows into a single line).
- Alternatively, format lists of repositories or files using clean, structured Markdown bullet points.
- Always provide concise, clear, and high-quality technical answers.
- Do not use emojis in your responses.`;

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
 * In-memory thread registry
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
 * In-memory checkpointer for multi-turn thread retention
 */
export const checkpointer = new MemorySaver();

let compiledAgentInstance: any = null;
let activeToolsList: any[] = [...basicTools];

function formatToolForModel(tool: any) {
  let parameters: any = { type: "object", properties: {} };
  if (tool.schema) {
    if (tool.schema._def) {
      parameters = zodToJsonSchema(tool.schema);
    } else {
      parameters = tool.schema;
    }
  }

  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters,
    },
  };
}

/**
 * Builds or retrieves the compiled LangGraph agent with all basic and MCP tools attached
 */
export async function getCompiledAgent() {
  if (compiledAgentInstance) {
    return compiledAgentInstance;
  }

  // Load MCP tools from Filesystem MCP / GitHub MCP servers
  const mcpTools = await initializeMcpClient();
  activeToolsList = [...basicTools, ...mcpTools];

  console.log(
    `[Agent] Initializing LangGraph agent with ${activeToolsList.length} total tools (${basicTools.length} basic + ${mcpTools.length} MCP)...`
  );

  const formattedTools = activeToolsList.map(formatToolForModel);
  const modelWithTools = (typeof (model as any).bind === "function")
    ? (model as any).bind({ tools: formattedTools })
    : model.bindTools(activeToolsList);

  const toolNode = new ToolNode(activeToolsList);

  async function callModel(state: typeof MessagesAnnotation.State) {
    const messagesWithSystem: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ];

    const response = await modelWithTools.invoke(messagesWithSystem);
    return { messages: [response] };
  }

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition)
    .addEdge("tools", "agent");

  compiledAgentInstance = workflow.compile({
    checkpointer,
  });

  return compiledAgentInstance;
}

/**
 * Returns all active tools (basic + MCP)
 */
export function getActiveTools() {
  return activeToolsList.map((t) => ({
    name: t.name,
    description: t.description || "",
    schema: (t as any).schema ? Object.keys((t as any).schema.shape || {}) : [],
  }));
}

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
        pending_sends: [],
      },
      {},
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
    } else if (parsed.content && Array.isArray(parsed.content)) {
      // MCP content block array formatting
      outputDisplay = parsed.content
        .map((c: any) => (typeof c.text === "string" ? c.text : JSON.stringify(c)))
        .join("\n");
    }
  } catch {
    // keep raw
  }

  // Truncate overly long tool output in history cards if necessary
  if (outputDisplay.length > 1500) {
    outputDisplay = outputDisplay.slice(0, 1500) + "\n... [truncated for display]";
  }

  return `> **Tool Executed: \`${toolName}\`**  \n> - **Parameters**: \`${inputStr}\`  \n> - **Result**: \`${outputDisplay}\`\n\n---`;
}

/**
 * Retrieve thread state history from LangGraph checkpointer with formatted tool execution cards
 */
export async function getThreadHistory(threadId: string) {
  const agentInstance = await getCompiledAgent();
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  const state = await agentInstance.getState(config);
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
  const agentInstance = await getCompiledAgent();
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Regeneration detection
  const state = await agentInstance.getState(config);
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

  const result = await agentInstance.invoke(
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
  const agentInstance = await getCompiledAgent();
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Regeneration detection: if last human message is identical to incoming prompt, rewind previous turn
  const state = await agentInstance.getState(config);
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

  const eventStream = agentInstance.streamEvents(
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
