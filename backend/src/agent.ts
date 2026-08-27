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
import { initializeMcpClient, getLoadedMcpTools } from "./mcp/client.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import crypto from "crypto";

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

Formatting Guidelines:
- When presenting tabular data, ensure every Markdown table row is on its own separate line with standard newlines (never combine multiple rows into a single line).
- Alternatively, format lists of repositories, files, events, or emails using clean, structured Markdown bullet points.
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
 * Custom State Annotation with loop counter and message history.
 */
export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  loopCount: Annotation<number>({
    reducer: (x, y) => (typeof y === "number" ? y : (x || 0)),
    default: () => 0,
  }),
});

/**
 * Builds or retrieves the compiled LangGraph agent with permission-gated tool execution.
 *
 * Graph topology:
 *   START -> agent -> (toolsCondition) -> permissionGate -> tools -> agent
 *                                      -> END
 *
 * The permissionGate node checks tool risk levels:
 * - READ tools: pass through immediately to the tools node
 * - WRITE/DESTRUCTIVE tools: call interrupt() to pause for HITL confirmation
 */
export async function getCompiledAgent() {
  if (compiledAgentInstance) {
    return compiledAgentInstance;
  }

  // Load MCP tools from Filesystem MCP / GitHub MCP servers
  const mcpTools = await initializeMcpClient();
  activeToolsList = [...basicTools, ...googleWorkspaceTools, ...mcpTools];

  // Register all tools in the permission registry (MCP tools default to WRITE if unknown)
  registerTools(
    activeToolsList.map((t) => ({ name: t.name, description: t.description })),
    ToolRiskLevel.WRITE,
    false
  );

  console.log(
    `[Agent] Initializing LangGraph agent with ${activeToolsList.length} total tools (3 basic + 6 Google Workspace + ${activeToolsList.length - 9} MCP)...`
  );

  const formattedTools = activeToolsList.map(formatToolForModel);
  const modelWithTools = (typeof (model as any).bind === "function")
    ? (model as any).bind({ tools: formattedTools })
    : model.bindTools(activeToolsList);

  const toolNode = new ToolNode(activeToolsList);

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

    const messagesWithSystem: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ];

    const response = await modelWithTools.invoke(messagesWithSystem);
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
      const decision = checkPermission(tc.name);
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
    .addNode("agent", callModel)
    .addNode("permissionGate", permissionGate)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, {
      permissionGate: "permissionGate",
      __end__: END,
    })
    .addConditionalEdges("permissionGate", afterPermissionGate, {
      tools: "tools",
      agent: "agent",
    })
    .addEdge("tools", "agent");

  compiledAgentInstance = workflow.compile({
    checkpointer,
  });
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
  const content = typeof lastMessage.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage.content);

  return { content, interrupted: false };
}

/**
 * Helper to stream raw token chunks, tool events, and HITL confirmation events
 * from LangGraph using streamEvents.
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

  const eventStream = agentInstance.streamEvents(
    new Command({ resume: { approved } }),
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

  const blob = await graph.drawMermaidPng();
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(targetFilename, buffer);
  console.log(`[Agent] Graph diagram saved to: ${targetFilename}`);
}
