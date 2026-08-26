import {
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { SystemMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";
import { model } from "./models.js";

const SYSTEM_PROMPT = `You are an expert Developer Personal Assistant Agent.
You assist developers with:
1. Code analysis, refactoring, and debugging.
2. Architecture design and implementation planning.
3. Git workflow, issue tracking, and PR reviews.
4. Explaining tools and executing system tasks.

Always provide concise, clear, and high-quality technical answers.
Do not use emojis in your responses.`;

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
 * Helper to invoke the agent for a given thread
 */
export async function invokeAgent(prompt: string, threadId: string = "default-thread") {
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
 * Helper to stream events from the agent
 */
export async function* streamAgent(prompt: string, threadId: string = "default-thread") {
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  const stream = await agent.stream(
    {
      messages: [new HumanMessage(prompt)],
    },
    {
      ...config,
      streamMode: "values",
    }
  );

  for await (const chunk of stream) {
    yield chunk;
  }
}
