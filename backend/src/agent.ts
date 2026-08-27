import {
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { SystemMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";
import { model } from "./models.js";
import crypto from "crypto";

const SYSTEM_PROMPT = `You are an expert Developer Personal Assistant Agent.
You assist developers with:
1. Code analysis, refactoring, and debugging.
2. Architecture design and implementation planning.
3. Git workflow, issue tracking, and PR reviews.
4. Explaining tools and executing system tasks.

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
 * Core reasoning node that invokes the active model with conversation state.
 */
async function callModel(state: typeof MessagesAnnotation.State) {
  const messagesWithSystem: BaseMessage[] = [
    new SystemMessage(SYSTEM_PROMPT),
    ...state.messages,
  ];

  const response = await model.invoke(messagesWithSystem);
  return { messages: [response] };
}

/**
 * LangGraph Agent StateGraph workflow
 */
const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addEdge("agent", END);

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
    if (m instanceof HumanMessage || m._getType() === "human") {
      role = "user";
    } else if (m instanceof SystemMessage || m._getType() === "system") {
      role = "system";
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
  return {
    content: typeof lastMessage.content === "string" ? lastMessage.content : JSON.stringify(lastMessage.content),
    messages: result.messages,
  };
}

/**
 * Helper to stream raw token chunks from LangGraph using streamEvents
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
        yield text;
      }
    }
  }
}
