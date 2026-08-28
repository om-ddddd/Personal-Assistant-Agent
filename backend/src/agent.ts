import {
  StateGraph,
  MessagesAnnotation,
  Annotation,
  MemorySaver,
  START,
  END,
  interrupt,
  Command,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { SystemMessage, HumanMessage, AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { model } from "./models.js";
import { basicTools } from "./tools/basic.js";
import { googleWorkspaceTools } from "./tools/google-workspace.js";
import { memoryTools } from "./tools/memory-tools.js";
import {
  startBackgroundRepoAnalysisTool,
  checkBackgroundJobStatusTool,
  listBackgroundJobsTool,
} from "./tools/job-tools.js";
import { initializeMcpClient, getLoadedMcpTools } from "./mcp/client.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import crypto from "crypto";

// Database & checkpointer imports
import { prisma, isDatabaseConnected } from "./db/prisma.js";
import { getCheckpointer } from "./db/checkpointer.js";

// Short-term memory imports (trimming + progressive summarization)
import {
  trimConversationMessages,
  summarizeConversationHistory,
  buildPromptWithMemoryContext,
  stripEchoedSummary,
  SHORT_TERM_MEMORY_CONFIG,
} from "./memory/short-term.js";

// Long-term memory imports (pgvector semantic search)
import {
  searchRelevantMemories,
  formatLongTermMemoriesForPrompt,
  initPgVectorSchema,
} from "./memory/long-term.js";

// Permission system imports
import { ToolRiskLevel, ConfirmationStatus } from "./permissions/types.js";
import { checkPermission, registerTools } from "./permissions/registry.js";
import {
  createPendingConfirmation,
  resolvePendingConfirmation,
  getPendingConfirmation,
  listPendingConfirmations,
} from "./permissions/manager.js";

const SYSTEM_PROMPT = `You are an expert Developer Personal Assistant Agent.
You assist developers with:
1. Navigating and managing the workspace filesystem via Filesystem MCP tools (read_text_file, list_directory, search_files, write_file, edit_file, etc.).
2. Mathematical calculations (calculator) and system time queries (get_time).
3. GitHub repository operations and code reviews via GitHub MCP tools and list_my_github_repositories.
4. Google Workspace management:
   - Google Calendar: listing upcoming meetings (list_calendar_events), scheduling events (create_calendar_event), and deleting events (delete_calendar_event).
   - Gmail: searching and listing inbox emails (list_emails), reading full message details (read_email), and sending emails (send_email).
5. Analyzing, refactoring, and debugging source code.

When the user asks to inspect, read, search, or list files in the project or workspace, ALWAYS use the appropriate Filesystem MCP tool.
When the user asks to list, inspect, or describe their own GitHub repositories, ALWAYS use the list_my_github_repositories tool.
When the user asks about calendar events, meetings, scheduling, or emails, ALWAYS use the appropriate Google Workspace tools (list_calendar_events, create_calendar_event, list_emails, read_email, send_email).

Memory and Context Rules:
- When storing user facts or preferences with the save_memory tool, do so silently in the background and only store exact, verified facts provided by the user.
- Never make robotic meta-announcements about internal memory systems (e.g. do NOT say "I have saved this in my long-term memory"). Respond naturally and conversationally to the user in context.
- When background context or conversation summaries are provided in system prompt, use them strictly for internal contextual awareness.
- CRITICAL: NEVER output, repeat, summarize, echo, or recite internal memory, past conversation summaries, or operational status logs to the user.
- NEVER begin your response with "The user began...", "The user opened...", or any narrative summary of previous turns.
- Always respond directly, concisely, and helpfully to the user's latest request.

Formatting Guidelines:
- When presenting tabular data, ensure every Markdown table row is on its own separate line with standard newlines (never combine multiple rows into a single line).
- Alternatively, format lists of repositories, files, events, or emails using clean, structured Markdown bullet points.
- Always provide concise, clear, and high-quality technical answers.
- Do not use emojis in your responses.`;


export interface ThreadMetadata {
  id: string;
  userId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summary?: string;
}

/**
 * In-memory registry of thread metadata with Prisma DB persistence synchronization.
 */
const threadStore = new Map<string, ThreadMetadata>();

/**
 * List registered threads scoped to the requesting user (sorted newest first).
 * If userId is provided, only returns threads belonging to that user.
 * If userId is null/undefined, returns guest/unauthenticated threads.
 */
export async function listThreads(userId?: string | null): Promise<ThreadMetadata[]> {
  const merged = new Map<string, ThreadMetadata>();
  const targetUserId = userId || null;

  // 1. Load active in-memory threads matching user scope
  for (const t of threadStore.values()) {
    const threadOwner = t.userId || null;
    if (targetUserId) {
      if (threadOwner === targetUserId) {
        merged.set(t.id, t);
      }
    } else {
      // Guest / unauthenticated scope: only show threads without an assigned user
      if (!threadOwner || threadOwner === "guest") {
        merged.set(t.id, t);
      }
    }
  }

  // 2. Merge with database threads
  if (isDatabaseConnected()) {
    try {
      const dbThreads = await prisma.thread.findMany({
        where: targetUserId ? { userId: targetUserId } : { userId: null },
        orderBy: { updatedAt: "desc" },
      });
      for (const t of dbThreads) {
        merged.set(t.id, {
          id: t.id,
          userId: t.userId || null,
          title: t.title,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          messageCount: t.messageCount,
          summary: t.summary || undefined,
        });
      }
    } catch {
      // fallback to memory
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Create a new distinct thread session with a unique UUID associated with a user.
 */
export function createThread(
  initialTitle: string = "New Conversation",
  userId?: string | null
): ThreadMetadata {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ownerId = userId || null;

  const thread: ThreadMetadata = {
    id,
    userId: ownerId,
    title: initialTitle,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
  threadStore.set(id, thread);

  if (isDatabaseConnected()) {
    prisma.thread
      .create({
        data: {
          id,
          userId: ownerId,
          title: initialTitle,
          messageCount: 0,
        },
      })
      .catch(() => {});
  }

  return thread;
}

/**
 * Retrieve metadata for a single thread, checking user ownership if userId provided.
 */
export async function getThread(id: string, userId?: string | null): Promise<ThreadMetadata | undefined> {
  let thread: ThreadMetadata | undefined;

  if (isDatabaseConnected()) {
    try {
      const dbThread = await prisma.thread.findUnique({ where: { id } });
      if (dbThread) {
        thread = {
          id: dbThread.id,
          userId: dbThread.userId || null,
          title: dbThread.title,
          createdAt: dbThread.createdAt.toISOString(),
          updatedAt: dbThread.updatedAt.toISOString(),
          messageCount: dbThread.messageCount,
          summary: dbThread.summary || undefined,
        };
      }
    } catch {
      // fallback
    }
  }

  if (!thread) {
    thread = threadStore.get(id);
  }

  if (thread && userId !== undefined) {
    const threadOwner = thread.userId || null;
    const requester = userId || null;
    if (threadOwner && requester && threadOwner !== requester) {
      return undefined; // Not authorized
    }
  }

  return thread;
}

/**
 * Delete a thread session from the registry and database, verifying user ownership.
 */
export async function deleteThread(id: string, userId?: string | null): Promise<boolean> {
  const existing = await getThread(id);
  if (existing && userId !== undefined && existing.userId) {
    const requester = userId || null;
    if (existing.userId !== requester) {
      return false; // Cannot delete another user's thread
    }
  }

  if (isDatabaseConnected()) {
    try {
      await prisma.thread.delete({ where: { id } });
    } catch {
      // ignore
    }
  }
  return threadStore.delete(id);
}

/**
 * Touch a thread to increment message count, refresh timestamp, and generate title from first prompt
 */
export function touchThread(id: string, prompt?: string, userId?: string | null): ThreadMetadata {
  let thread = threadStore.get(id);
  const now = new Date().toISOString();
  const ownerId = userId || null;

  if (!thread) {
    let title = "New Conversation";
    if (prompt && prompt.trim()) {
      const clean = prompt.trim();
      title = clean.length > 36 ? clean.slice(0, 36) + "..." : clean;
    }
    thread = {
      id,
      userId: ownerId,
      title,
      createdAt: now,
      updatedAt: now,
      messageCount: 1,
    };
    threadStore.set(id, thread);

    if (isDatabaseConnected()) {
      prisma.thread
        .upsert({
          where: { id },
          create: {
            id,
            userId: ownerId,
            title,
            messageCount: 1,
          },
          update: {
            updatedAt: new Date(),
            messageCount: { increment: 1 },
          },
        })
        .catch(() => {});
    }

    return thread;
  }

  thread.messageCount += 1;
  thread.updatedAt = now;
  if (ownerId && !thread.userId) {
    thread.userId = ownerId;
  }

  if (thread.title === "New Conversation" && prompt && prompt.trim()) {
    const clean = prompt.trim();
    thread.title = clean.length > 36 ? clean.slice(0, 36) + "..." : clean;
  }

  threadStore.set(id, thread);

  if (isDatabaseConnected()) {
    prisma.thread
      .upsert({
        where: { id },
        create: {
          id,
          userId: thread.userId || null,
          title: thread.title,
          messageCount: thread.messageCount,
        },
        update: {
          userId: thread.userId || null,
          title: thread.title,
          updatedAt: new Date(),
          messageCount: thread.messageCount,
        },
      })
      .catch(() => {});
  }

  return thread;
}

/**
 * In-memory checkpointer for multi-turn thread retention
 */
export const checkpointer = getCheckpointer();

let compiledAgentInstance: any = null;
let activeToolsList: any[] = [...basicTools, ...googleWorkspaceTools];

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
 * Maximum number of agent-tool execution cycles allowed per request
 * to prevent infinite runaway agent loops.
 */
export const MAX_AGENT_LOOPS = 10;

/**
 * Custom State Annotation with messages, short-term summary, long-term cross-thread memories, and loop guard.
 */
export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (x, y) => (y !== undefined && y !== "" ? y : (x || "")),
    default: () => "",
  }),
  longTermMemories: Annotation<string>({
    reducer: (x, y) => (y !== undefined ? y : (x || "")),
    default: () => "",
  }),
  loopCount: Annotation<number>({
    reducer: (x, y) => (typeof y === "number" ? y : (x || 0)),
    default: () => 0,
  }),
});

/**
 * Builds or retrieves the compiled LangGraph agent with permission-gated tool execution,
 * short-term memory (trimming & progressive summarization), and long-term memory (pgvector).
 */
export async function getCompiledAgent() {
  if (compiledAgentInstance) {
    return compiledAgentInstance;
  }

  // Load MCP tools from Filesystem MCP / GitHub MCP servers
  const mcpTools = await initializeMcpClient();
  const jobTools = [
    startBackgroundRepoAnalysisTool,
    checkBackgroundJobStatusTool,
    listBackgroundJobsTool,
  ];
  activeToolsList = [
    ...basicTools,
    ...memoryTools,
    ...googleWorkspaceTools,
    ...jobTools,
    ...mcpTools,
  ];

  // Register all tools in the permission registry (MCP tools default to WRITE if unknown)
  registerTools(
    activeToolsList.map((t) => ({ name: t.name, description: t.description })),
    ToolRiskLevel.WRITE,
    false
  );

  // Mark background status/list tools as READ
  registerTools(
    [
      { name: "check_background_job_status", description: "Check status of a background job" },
      { name: "list_my_background_jobs", description: "List background jobs" },
    ],
    ToolRiskLevel.READ,
    true
  );

  console.log(
    `[Agent] Initializing LangGraph agent with ${activeToolsList.length} total tools (3 basic + 3 memory + 6 Google Workspace + 3 Background Jobs + ${activeToolsList.length - 15} MCP)...`
  );

  const formattedTools = activeToolsList.map(formatToolForModel);
  const modelWithTools = (typeof (model as any).bind === "function")
    ? (model as any).bind({ tools: formattedTools })
    : model.bindTools(activeToolsList);

  const toolNode = new ToolNode(activeToolsList);

  /**
   * Dedicated Memory Node:
   * 1. Short-Term Memory: Inspects turn count and computes progressive summary.
   * 2. Long-Term Memory: Uses pgvector cosine similarity to recall relevant cross-thread memories.
   */
  async function memoryNode(state: typeof AgentStateAnnotation.State, config?: any) {
    const threadId = config?.configurable?.thread_id;
    let currentSummary = state.summary || "";

    // 1. Short-Term Progressive Summarization
    if (state.messages.length >= SHORT_TERM_MEMORY_CONFIG.SUMMARIZATION_THRESHOLD) {
      currentSummary = await summarizeConversationHistory(state.messages, currentSummary);
      if (threadId && currentSummary) {
        const stored = threadStore.get(threadId);
        if (stored) {
          stored.summary = currentSummary;
          threadStore.set(threadId, stored);
        }
        if (isDatabaseConnected()) {
          prisma.thread
            .update({
              where: { id: threadId },
              data: { summary: currentSummary },
            })
            .catch(() => {});
        }
      }
    }

    // 2. Long-Term Memory: Semantic Vector Search for relevant user facts
    let longTermContext = state.longTermMemories || "";
    const lastHuman = state.messages
      .filter((m: any) => m instanceof HumanMessage || m.getType?.() === "human" || (m as any)._getType?.() === "human")
      .pop();

    if (lastHuman) {
      const userPrompt = typeof lastHuman.content === "string" ? lastHuman.content : JSON.stringify(lastHuman.content);
      try {
        const relevantMemories = await searchRelevantMemories(userPrompt, 4, 0.35);
        longTermContext = formatLongTermMemoriesForPrompt(relevantMemories);
      } catch (err) {
        console.warn("[Agent] Failed to retrieve long-term memories:", err);
      }
    }

    return {
      summary: currentSummary,
      longTermMemories: longTermContext,
    };
  }

  async function callModel(state: typeof AgentStateAnnotation.State) {
    const currentLoop = (state.loopCount || 0) + 1;

    // Runaway loop guard: if loop limit reached, stop and return explanation
    if (currentLoop > MAX_AGENT_LOOPS) {
      console.warn(
        `[Agent] Loop guard triggered: reached maximum loop count (${MAX_AGENT_LOOPS}). Terminating.`
      );
      const guardMessage = new AIMessage(
        `I could not complete this task within the allotted step limit (${MAX_AGENT_LOOPS} cycles). To prevent an infinite execution loop, execution has been paused. Please try breaking down your request into smaller steps.`
      );
      return { messages: [guardMessage], loopCount: currentLoop };
    }

    // Short-Term Memory: Prompt Trimming (Sliding Window without breaking tool pairs)
    const trimmedMessages = await trimConversationMessages(state.messages);

    // Assemble System Prompt: Base System Prompt + Long-Term Memories + Short-Term Summary
    let fullSystemPrompt = SYSTEM_PROMPT;
    if (state.longTermMemories) {
      fullSystemPrompt += state.longTermMemories;
    }
    fullSystemPrompt = buildPromptWithMemoryContext(
      fullSystemPrompt,
      state.summary || ""
    );

    const messagesWithSystem: BaseMessage[] = [
      new SystemMessage(fullSystemPrompt),
      ...trimmedMessages,
    ];

    const response = await modelWithTools.invoke(messagesWithSystem);
    if (typeof response.content === "string") {
      response.content = stripEchoedSummary(response.content, state.summary);
    }
    return { messages: [response], loopCount: currentLoop };
  }

  function isAIMessage(msg: any): boolean {
    if (!msg) return false;
    if (msg instanceof AIMessage) return true;
    if (typeof msg.getType === "function" && msg.getType() === "ai") return true;
    if (typeof msg._getType === "function" && msg._getType() === "ai") return true;
    if (msg.constructor?.name?.startsWith("AIMessage")) return true;
    return false;
  }

  function isToolMessage(msg: any): boolean {
    if (!msg) return false;
    if (msg instanceof ToolMessage) return true;
    if (typeof msg.getType === "function" && msg.getType() === "tool") return true;
    if (typeof msg._getType === "function" && msg._getType() === "tool") return true;
    if (msg.constructor?.name?.startsWith("ToolMessage")) return true;
    return false;
  }

  /**
   * Permission Gate Node.
   *
   * Inspects the pending tool calls from the last AI message.
   * If any tool requires confirmation (WRITE or DESTRUCTIVE),
   * calls interrupt() to pause the graph and wait for human approval.
   * READ tools pass through without interruption.
   */
  async function permissionGate(state: typeof AgentStateAnnotation.State, config?: any) {
    const lastMessage = state.messages[state.messages.length - 1];
    const threadId = config?.configurable?.thread_id || "default-session";

    // Only AI messages with tool_calls reach this node
    if (!isAIMessage(lastMessage) || !(lastMessage as any).tool_calls?.length) {
      return { messages: [] };
    }

    const toolCalls = (lastMessage as any).tool_calls;
    const toolsNeedingConfirmation: Array<{
      name: string;
      args: Record<string, unknown>;
      id: string;
      riskLevel: ToolRiskLevel;
    }> = [];

    // Check each tool call's permission
    for (const tc of toolCalls) {
      const decision = checkPermission(tc.name, tc.args);
      if (decision.requiresConfirmation) {
        toolsNeedingConfirmation.push({
          name: tc.name,
          args: tc.args as Record<string, unknown>,
          id: tc.id || tc.name,
          riskLevel: decision.riskLevel,
        });
      }
    }

    // If no tools need confirmation, pass through
    if (toolsNeedingConfirmation.length === 0) {
      console.log(
        `[PermissionGate] All ${toolCalls.length} tool call(s) are READ-level, passing through.`
      );
      return { messages: [] };
    }

    // Store in pending confirmation manager
    const createdConfirmations = toolsNeedingConfirmation.map((t) =>
      createPendingConfirmation({
        threadId,
        toolName: t.name,
        toolArgs: t.args,
        riskLevel: t.riskLevel,
        description: `Requires human approval for ${t.riskLevel} operation: ${t.name}`,
      })
    );

    // Differentiate prompt friction and message by risk level
    const hasDestructive = toolsNeedingConfirmation.some((t) => t.riskLevel === "DESTRUCTIVE");
    const destructiveTools = toolsNeedingConfirmation.filter((t) => t.riskLevel === "DESTRUCTIVE");

    let promptMessage: string;
    if (hasDestructive) {
      promptMessage = `CAUTION: Explicit authorization required. The tool "${destructiveTools.map((t) => t.name).join(", ")}" is DESTRUCTIVE and will permanently modify or delete data.`;
    } else if (toolsNeedingConfirmation.length === 1) {
      promptMessage = `The tool "${toolsNeedingConfirmation[0].name}" (${toolsNeedingConfirmation[0].riskLevel}) requires your confirmation before execution.`;
    } else {
      promptMessage = `${toolsNeedingConfirmation.length} tools require your confirmation before execution.`;
    }

    // Build the confirmation request payload
    const confirmationPayload = {
      type: "confirmation_required" as const,
      tools: toolsNeedingConfirmation.map((t) => ({
        name: t.name,
        args: t.args,
        callId: t.id,
        riskLevel: t.riskLevel,
      })),
      hasDestructive,
      message: promptMessage,
    };

    console.log(
      `[PermissionGate] Interrupting for HITL confirmation: ${toolsNeedingConfirmation.map((t) => `${t.name}(${t.riskLevel})`).join(", ")}`
    );

    // interrupt() pauses the graph and returns the human's response when resumed via Command
    const humanDecision = interrupt(confirmationPayload);

    // When resumed, humanDecision contains { approved: boolean }
    const approved = humanDecision && typeof humanDecision === "object" && (humanDecision as any).approved === true;

    // Resolve stored confirmations
    for (const c of createdConfirmations) {
      resolvePendingConfirmation(c.id, approved);
    }

    if (approved) {
      console.log(`[PermissionGate] User APPROVED tool execution.`);
      // Return empty messages to pass through to tools node
      return { messages: [] };
    } else {
      console.log(`[PermissionGate] User REJECTED tool execution.`);
      // Return ToolMessage rejections for each tool call so the agent knows the user declined
      const rejectionMessages: ToolMessage[] = toolCalls.map((tc: any) =>
        new ToolMessage({
          tool_call_id: tc.id || tc.name,
          content: JSON.stringify({
            error: "REJECTED_BY_USER",
            message: `The user rejected the execution of "${tc.name}". Do not retry this tool call. Acknowledge the rejection and ask if the user would like to do something else.`,
          }),
        })
      );
      return { messages: rejectionMessages };
    }
  }

  /**
   * Routing function after permissionGate.
   *
   * If permissionGate returned rejection ToolMessages, route back to agent.
   * Otherwise, route to the tools node for execution.
   */
  function afterPermissionGate(state: typeof AgentStateAnnotation.State): "tools" | "agent" {
    const lastMessage = state.messages[state.messages.length - 1];

    // If the last message is a ToolMessage with rejection, route to agent
    if (isToolMessage(lastMessage)) {
      try {
        const content = JSON.parse(
          typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(lastMessage.content)
        );
        if (content.error === "REJECTED_BY_USER") {
          return "agent";
        }
      } catch {
        // Not a rejection message
      }
    }

    // Otherwise proceed to tool execution
    return "tools";
  }
  
  /**
   * Custom routing after the agent node.
   * Routes to permissionGate if tool calls are present, otherwise to END.
   * If the loop guard is reached, forces route to END.
   */
  function routeAfterAgent(state: typeof AgentStateAnnotation.State): "permissionGate" | "__end__" {
    // If loop guard was triggered, terminate immediately
    if ((state.loopCount || 0) > MAX_AGENT_LOOPS) {
      return "__end__";
    }

    const lastMessage = state.messages[state.messages.length - 1];
    const hasToolCalls = (lastMessage as any)?.tool_calls && (lastMessage as any).tool_calls.length > 0;
    if (isAIMessage(lastMessage) && hasToolCalls) {
      return "permissionGate";
    }
    return "__end__";
  }

  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode("memory", memoryNode)
    .addNode("agent", callModel)
    .addNode("permissionGate", permissionGate)
    .addNode("tools", toolNode)
    .addEdge(START, "memory")
    .addEdge("memory", "agent")
    .addConditionalEdges("agent", routeAfterAgent, {
      permissionGate: "permissionGate",
      __end__: END,
    })
    .addConditionalEdges("permissionGate", afterPermissionGate, {
      tools: "tools",
      agent: "agent",
    })
    .addEdge("tools", "agent");

  const checkpointerInstance = await getCheckpointer();

  compiledAgentInstance = workflow.compile({
    checkpointer: checkpointerInstance,
  });
  saveGraphImage(compiledAgentInstance, 'workflow.png')
  return compiledAgentInstance;
}

/**
 * Returns all active tools (basic + Google Workspace + MCP)
 */
export function getActiveTools() {
  const mcpTools = getLoadedMcpTools();
  const all = [...basicTools, ...googleWorkspaceTools, ...mcpTools];
  return all.map((t) => ({
    name: t.name,
    description: t.description || "",
    schema: (t as any).schema ? Object.keys((t as any).schema.shape || {}) : [],
  }));
}

/**
 * Roll back thread state in MemorySaver checkpointer to targetMessages
 */
export async function rewindThreadState(threadId: string, targetMessages: BaseMessage[]) {
  const checkpointer = await getCheckpointer();
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
export async function invokeAgent(
  prompt: string,
  threadId: string = "default-thread",
  userId?: string | null
) {
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

  touchThread(threadId, prompt, userId);

  const result = await agentInstance.invoke(
    {
      messages: [new HumanMessage(prompt)],
    },
    config
  );

  const lastMessage = result.messages[result.messages.length - 1];
  const toolMessages = result.messages.filter((m: BaseMessage) => m instanceof ToolMessage);
  const rawContent = typeof lastMessage.content === "string" ? lastMessage.content : JSON.stringify(lastMessage.content);
  const cleanContent = stripEchoedSummary(rawContent, state?.values?.summary);

  return {
    content: cleanContent,
    messages: result.messages,
    toolCallsCount: toolMessages.length,
    toolMessages,
  };
}

/**
 * Resume a paused graph after HITL confirmation.
 * Sends a Command with the user's decision (approved/rejected) to resume the interrupted graph.
 */
export async function resumeAfterConfirmation(
  threadId: string,
  approved: boolean
): Promise<{ content: string; interrupted: boolean; interruptPayload?: any }> {
  const agentInstance = await getCompiledAgent();
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  console.log(
    `[Agent] Resuming thread "${threadId}" with decision: ${approved ? "APPROVED" : "REJECTED"}`
  );

  // Resolve pending confirmation in store
  const pending = listPendingConfirmations(threadId);
  for (const p of pending) {
    if (p.status === ConfirmationStatus.PENDING) {
      resolvePendingConfirmation(p.id, approved);
    }
  }

  const result = await agentInstance.invoke(
    new Command({ resume: { approved } }),
    config
  );

  const lastMessage = result.messages[result.messages.length - 1];
  const rawContent = typeof lastMessage.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage.content);
  const content = stripEchoedSummary(rawContent);

  return { content, interrupted: false };
}

/**
 * Helper class to filter out any echoed internal summary or preamble
 * from streaming token chunks before sending to the client.
 */
class StreamTokenSanitizer {
  private isStartOfStream = true;
  private streamBuffer = "";
  private summary?: string;
  private minBufferLength: number;

  constructor(summary?: string) {
    this.summary = summary;
    this.minBufferLength = Math.max(250, (summary?.length || 0) + 20);
  }

  processChunk(text: string): string[] {
    if (!text) return [];

    if (!this.isStartOfStream) {
      return [text];
    }

    this.streamBuffer += text;

    const trimmedSummary = this.summary?.trim() || "";
    const looksLikeLeakage =
      (trimmedSummary.length > 15 && this.streamBuffer.startsWith(trimmedSummary.slice(0, 15))) ||
      /^The user (began|opened|started|inquired|asked|queried|greeted)/i.test(this.streamBuffer) ||
      /^<background_context>/i.test(this.streamBuffer) ||
      /^## Internal Conversation Memory/i.test(this.streamBuffer);

    if (!looksLikeLeakage) {
      this.isStartOfStream = false;
      const out = this.streamBuffer;
      this.streamBuffer = "";
      return [out];
    }

    // Only buffer if it matches the pattern of a leaked summary
    if (this.streamBuffer.length >= this.minBufferLength || this.streamBuffer.includes("\n\n")) {
      const cleaned = stripEchoedSummary(this.streamBuffer, this.summary);
      this.isStartOfStream = false;
      this.streamBuffer = "";
      return cleaned ? [cleaned] : [];
    }

    return [];
  }

  flush(): string | null {
    if (this.isStartOfStream && this.streamBuffer) {
      const cleaned = stripEchoedSummary(this.streamBuffer, this.summary);
      this.streamBuffer = "";
      this.isStartOfStream = false;
      return cleaned || null;
    }
    return null;
  }
}

/**
 * Helper to stream raw token chunks, tool events, and HITL confirmation events
 * from LangGraph using streamEvents.
 */
export async function* streamAgentEvents(
  prompt: string,
  threadId: string = "default-thread",
  userId?: string | null
) {
  const agentInstance = await getCompiledAgent();
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Regeneration detection: if last human message is identical to incoming prompt, rewind previous turn
  const state = await agentInstance.getState(config);
  const threadSummary = state?.values?.summary;

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

  touchThread(threadId, prompt, userId);

  const eventStream = agentInstance.streamEvents(
    {
      messages: [new HumanMessage(prompt)],
    },
    {
      ...config,
      version: "v2",
    }
  );

  const sanitizer = new StreamTokenSanitizer(threadSummary);

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
        const outChunks = sanitizer.processChunk(text);
        for (const outText of outChunks) {
          yield { type: "text", text: outText };
        }
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

  const trailingText = sanitizer.flush();
  if (trailingText) {
    yield { type: "text", text: trailingText };
  }
}

/**
 * Stream agent events when resuming after HITL confirmation.
 * Uses Command to resume the interrupted graph and streams the result.
 */
export async function* streamResumeEvents(threadId: string, approved: boolean) {
  const agentInstance = await getCompiledAgent();
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  console.log(
    `[Agent] Streaming resume for thread "${threadId}" with decision: ${approved ? "APPROVED" : "REJECTED"}`
  );

  // Resolve pending confirmation in store
  const pending = listPendingConfirmations(threadId);
  for (const p of pending) {
    if (p.status === ConfirmationStatus.PENDING) {
      resolvePendingConfirmation(p.id, approved);
    }
  }

  const state = await agentInstance.getState(config);
  const threadSummary = state?.values?.summary;

  const eventStream = agentInstance.streamEvents(
    new Command({ resume: { approved } }),
    {
      ...config,
      version: "v2",
    }
  );

  const sanitizer = new StreamTokenSanitizer(threadSummary);

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
        const outChunks = sanitizer.processChunk(text);
        for (const outText of outChunks) {
          yield { type: "text", text: outText };
        }
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

  const trailingText = sanitizer.flush();
  if (trailingText) {
    yield { type: "text", text: trailingText };
  }
}

/**
 * Check if a thread is currently interrupted (waiting for HITL confirmation).
 * Returns the interrupt payload if interrupted, or null otherwise.
 */
export async function getThreadInterruptState(threadId: string): Promise<any | null> {
  const agentInstance = await getCompiledAgent();
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  const state = await agentInstance.getState(config);
  if (!state || !state.next || state.next.length === 0) return null;

  // LangGraph stores interrupt info in state.tasks when paused
  const tasks = state.tasks || [];
  for (const task of tasks) {
    if (task.interrupts && task.interrupts.length > 0) {
      return task.interrupts.map((i: any) => i.value);
    }
  }

  return null;
}

/**
 * Render and save the LangGraph execution topology as a PNG diagram.
 * Supports:
 * - saveGraphImage() -> uses compiled agent and default "graph.png"
 * - saveGraphImage("my-graph.png") -> uses compiled agent and custom filename
 * - saveGraphImage(agentInstance, "my-graph.png") -> uses provided agent instance
 */
export async function saveGraphImage(
  appOrFilename?: { getGraph?: () => any; getGraphAsync?: () => Promise<any> } | string,
  filename = "graph.png"
): Promise<void> {
  const fs = await import("node:fs/promises");

  let targetApp: any;
  let targetFilename = filename;

  if (typeof appOrFilename === "string") {
    targetFilename = appOrFilename;
    targetApp = await getCompiledAgent();
  } else if (appOrFilename && (typeof appOrFilename.getGraph === "function" || typeof appOrFilename.getGraphAsync === "function")) {
    targetApp = appOrFilename;
  } else {
    targetApp = await getCompiledAgent();
  }

  const graph = typeof targetApp.getGraphAsync === "function"
    ? await targetApp.getGraphAsync()
    : targetApp.getGraph();

  try {
    const blob = await graph.drawMermaidPng();
    const buffer = Buffer.from(await blob.arrayBuffer());
    await fs.writeFile(targetFilename, buffer);
    console.log(`[Agent] Graph diagram saved to: ${targetFilename}`);
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(`[Agent] Could not render diagram image: ${error.message}`);
  }
}
