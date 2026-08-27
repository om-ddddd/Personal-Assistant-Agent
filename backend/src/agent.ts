import {
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { SystemMessage, HumanMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
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
 * Save graph visualization as a PNG image file
 */
export async function saveGraphImage(filename = "graph.png"): Promise<void> {
  const fs = await import("node:fs/promises");
  const graph = await agent.getGraphAsync();
  const blob = await graph.drawMermaidPng();
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(filename, buffer);
  console.log(`Graph diagram saved to: ${filename}`);
}

/**
 * Print the Mermaid diagram markdown string to the console
 */
export async function printMermaid(): Promise<void> {
  const graph = await agent.getGraphAsync();
  console.log("\nMermaid Diagram:\n");
  console.log(graph.drawMermaid());
}

/**
 * Retrieve thread state history from LangGraph checkpointer
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
  return rawMessages.map((m) => {
    let role = "assistant";
    if (m instanceof HumanMessage || m.getType() === "human") {
      role = "user";
    } else if (m instanceof SystemMessage || m.getType() === "system") {
      role = "system";
    } else if (m instanceof ToolMessage || m.getType() === "tool") {
      role = "tool";
    }

    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return {
      id: m.id || crypto.randomUUID(),
      role,
      content,
    };
  });
}

/**
 * Helper to invoke the agent for a given thread
 */
export async function invokeAgent(prompt: string, threadId: string = "default-thread") {
  touchThread(threadId, prompt);

  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

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
  touchThread(threadId, prompt);

  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

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
      yield {
        type: "tool_start",
        tool: event.name,
        input: event.data?.input,
      };
    } else if (event.event === "on_tool_end") {
      yield {
        type: "tool_end",
        tool: event.name,
        output: typeof event.data?.output === "string" ? event.data.output : JSON.stringify(event.data?.output),
      };
    }
  }
}
