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
    ? `You are an internal memory summarizer for an AI assistant.
Current memory notes:
"${existingSummary}"

Recent conversation turns:
${transcript}

Task: Update the memory notes into a concise, bulleted list of essential user facts, project context, active user requests, and tool outcomes.
Rules:
- Format as bullet points starting with "- "
- Do NOT write narrative paragraphs or stories (never start with "The user opened...", "The user began...", "The conversation started...").
- Keep it under 150 words.
- Do not use emojis.`
    : `You are an internal memory summarizer for an AI assistant.
Conversation turns to summarize:
${transcript}

Task: Distill the conversation into a concise, bulleted list of essential user facts, project context, active user requests, and tool outcomes.
Rules:
- Format as bullet points starting with "- "
- Do NOT write narrative paragraphs or stories (never start with "The user opened...", "The user began...", "The conversation started...").
- Keep it under 150 words.
- Do not use emojis.`;

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

## Internal Conversation Memory (DO NOT REPEAT OR RECAP TO USER):
The following are internal notes summarizing earlier turns in this conversation thread:
${summary.trim()}

Strict Instruction: This internal memory is strictly for your background awareness. NEVER repeat, quote, recite, or summarize this memory in your response to the user. Answer the user's latest prompt directly.`;
}

/**
 * Strips any echoed conversation summary, background context tags, or narrative preamble
 * that the model may inadvertently prefix to its response.
 */
export function stripEchoedSummary(text: string, summary?: string): string {
  if (!text) return "";
  let cleaned = text;

  // 1. Strip XML-like wrapper leaks if present
  cleaned = cleaned.replace(/^<background_context>[\s\S]*?<\/background_context>\s*/i, "");
  cleaned = cleaned.replace(/^##\s*Internal Conversation Memory[\s\S]*?(?=\n\n|\n[A-Z0-9]|$)/i, "");

  // 2. Strip exact or near-exact summary text if the model echoed it at the start
  if (summary && summary.trim()) {
    const trimmedSummary = summary.trim();
    if (cleaned.startsWith(trimmedSummary)) {
      cleaned = cleaned.slice(trimmedSummary.length).trimStart();
    } else {
      // Check first sentence or first 40 chars of summary
      const firstSentence = trimmedSummary.split(/[.!?]\s+/)[0];
      if (firstSentence && firstSentence.length > 15 && cleaned.startsWith(firstSentence)) {
        const last30 = trimmedSummary.slice(-30);
        const summaryEndIdx = cleaned.indexOf(last30);
        if (summaryEndIdx !== -1) {
          cleaned = cleaned.slice(summaryEndIdx + last30.length).trimStart();
        } else {
          const paragraphEnd = cleaned.indexOf("\n\n");
          if (paragraphEnd !== -1 && paragraphEnd <= trimmedSummary.length + 50) {
            cleaned = cleaned.slice(paragraphEnd + 2).trimStart();
          }
        }
      }
    }
  }

  // 3. Strip narrative preamble patterns even if summary string was not passed or slightly varied
  const narrativeBlockRegex = /^(?:(?:The user|After (?:the|receiving)|The assistant|It responded|Finally,|In this exchange|No external tools|No personal info)[\s\S]*?\.\s*)+(?=(?:I |I'm|I've|I'd|I don't|Sure|Here|Hello|Hi|Please|Based on|According to|\d|\*|\#))/i;

  if (narrativeBlockRegex.test(cleaned)) {
    cleaned = cleaned.replace(narrativeBlockRegex, "").trimStart();
  }

  return cleaned;
}

