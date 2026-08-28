import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  trimMessages,
} from "@langchain/core/messages";
import { model } from "../models.js";

/**
 * Default parameters for short-term memory management.
 */
export const SHORT_TERM_MEMORY_CONFIG = {
  /** Maximum number of messages to send in the immediate LLM context window */
  MAX_MESSAGES_WINDOW: 6,
  /** Maximum token limit approximation for trimmed message window */
  MAX_TOKENS_BUDGET: 4000,
  /** Threshold of total message turns before triggering progressive summarization */
  SUMMARIZATION_THRESHOLD: 8,
  /** Number of recent messages to preserve un-summarized */
  KEEP_RECENT_UNSUMMARIZED: 4,
};

/**
 * Estimate token count for messages based on character length (~4 chars per token).
 */
export function estimateMessageTokens(messages: BaseMessage[]): number {
  let totalChars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      totalChars += m.content.length;
    } else if (Array.isArray(m.content)) {
      totalChars += JSON.stringify(m.content).length;
    }
  }
  return Math.ceil(totalChars / 4);
}

/**
 * Trim conversation messages to fit within token and window constraints.
 * Ensures tool call and tool message pairs are never separated.
 */
export async function trimConversationMessages(
  messages: BaseMessage[],
  maxTokens: number = SHORT_TERM_MEMORY_CONFIG.MAX_TOKENS_BUDGET,
  maxWindow: number = SHORT_TERM_MEMORY_CONFIG.MAX_MESSAGES_WINDOW
): Promise<BaseMessage[]> {
  if (!messages || messages.length === 0) return [];

  // If already under both limits, return as is
  if (messages.length <= maxWindow && estimateMessageTokens(messages) <= maxTokens) {
    return messages;
  }

  try {
    const trimmed = await trimMessages(messages, {
      strategy: "last",
      maxTokens,
      tokenCounter: async (msgs) => estimateMessageTokens(msgs),
      allowPartial: false,
      startOn: "human",
    });

    // Enforce maxWindow constraint if still exceeding message count
    if (trimmed.length > maxWindow) {
      const windowSlice = trimmed.slice(-maxWindow);
      // Ensure we don't start on an orphaned ToolMessage
      let startIndex = 0;
      while (
        startIndex < windowSlice.length &&
        (windowSlice[startIndex] instanceof ToolMessage ||
          (typeof windowSlice[startIndex].getType === "function" &&
            windowSlice[startIndex].getType() === "tool"))
      ) {
        startIndex++;
      }
      return windowSlice.slice(startIndex);
    }

    return trimmed;
  } catch (err) {
    console.warn("[ShortTermMemory] trimMessages failed, falling back to window slice:", err);
    return messages.slice(-maxWindow);
  }
}

/**
 * Generate or extend a progressive conversational summary of older messages.
 */
export async function summarizeConversationHistory(
  messages: BaseMessage[],
  existingSummary: string = ""
): Promise<string> {
  if (!messages || messages.length <= SHORT_TERM_MEMORY_CONFIG.KEEP_RECENT_UNSUMMARIZED) {
    return existingSummary;
  }

  // Slice messages that should be compressed into summary (all except recent unsummarized)
  const messagesToSummarize = messages.slice(
    0,
    messages.length - SHORT_TERM_MEMORY_CONFIG.KEEP_RECENT_UNSUMMARIZED
  );

  if (messagesToSummarize.length === 0) {
    return existingSummary;
  }

  // Format messages into a clear transcript
  const transcript = messagesToSummarize
    .map((m) => {
      let role = "User";
      if (
        m instanceof AIMessage ||
        (typeof m.getType === "function" && m.getType() === "ai")
      ) {
        role = "Assistant";
      } else if (
        m instanceof ToolMessage ||
        (typeof m.getType === "function" && m.getType() === "tool")
      ) {
        role = "Tool Output";
      }

      const text =
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content);
      return `${role}: ${text.slice(0, 300)}`;
    })
    .join("\n");

  const prompt = existingSummary
    ? `You are an expert conversation summarizer.
Current summary of previous conversation:
"${existingSummary}"

New conversation turns to incorporate:
${transcript}

Create a concise, updated summary capturing all key user requests, decisions, facts, and tool results. Keep it under 200 words. Do not use emojis.`
    : `You are an expert conversation summarizer.
Conversation turns to summarize:
${transcript}

Create a concise summary capturing the user's primary objectives, preferences, key facts, and tool results so far. Keep it under 150 words. Do not use emojis.`;

  try {
    const response = await model.invoke([new HumanMessage(prompt)]);
    const summaryText =
      typeof response.content === "string"
        ? response.content.trim()
        : JSON.stringify(response.content).trim();

    console.log(
      `[ShortTermMemory] Generated progressive summary (${summaryText.length} chars) for ${messagesToSummarize.length} older messages.`
    );
    return summaryText;
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(
      `[ShortTermMemory] Failed to generate summary (${error.message}). Retaining existing summary.`
    );
    return existingSummary;
  }
}

/**
 * Builds the complete system prompt injecting running summary context if present.
 */
export function buildPromptWithMemoryContext(
  baseSystemPrompt: string,
  summary: string
): string {
  if (!summary || !summary.trim()) {
    return baseSystemPrompt;
  }

  return `${baseSystemPrompt}

<background_context>
The following is an internal background summary of earlier conversation turns in this thread:
${summary.trim()}

CRITICAL INSTRUCTION FOR CONTEXT:
- This background summary is strictly for your internal memory and contextual awareness.
- NEVER quote, repeat, echo, summarize, or recite this background summary in your chat response.
- Answer the user's latest message directly, naturally, and helpfully without referencing past summaries.
</background_context>`;
}
