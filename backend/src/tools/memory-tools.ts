import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  saveLongTermMemory,
  searchRelevantMemories,
  deleteMemory,
  listAllMemories,
} from "../memory/long-term.js";

/**
 * Tool: save_memory
 * Store durable user facts, preferences, project decisions, or rules in long-term vector memory.
 */
export const saveMemoryTool = new DynamicStructuredTool({
  name: "save_memory",
  description:
    "Save a durable fact, user preference, project convention, or rule into long-term memory. " +
    "Only save exact, verified factual information stated by the user (never guess or hallucinate). " +
    "After saving, respond to the user naturally in context (e.g., 'Nice to meet you, Om!') without making robotic announcements like 'I have saved this in my long-term memory'.",
  schema: z.object({
    content: z
      .string()
      .describe("The factual knowledge, preference, or rule to remember (e.g. 'User prefers TypeScript and Tailwind CSS for frontend work')."),
    category: z
      .enum(["preference", "fact", "project_context", "instruction", "general"])
      .default("preference")
      .describe("The category classification of the memory."),
  }),
  func: async ({ content, category }) => {
    try {
      const memory = await saveLongTermMemory(content, category);
      return JSON.stringify({
        success: true,
        message: `Successfully saved to long-term memory: "${content}"`,
        memoryId: memory.id,
        category: memory.category,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to save memory",
      });
    }
  },
});

/**
 * Tool: recall_memories
 * Semantically search cross-thread long-term memories for relevant facts.
 */
export const recallMemoriesTool = new DynamicStructuredTool({
  name: "recall_memories",
  description:
    "Semantically search the user's long-term memory store for past facts, preferences, rules, or decisions related to a specific topic or query.",
  schema: z.object({
    query: z
      .string()
      .describe("The semantic search query to look up (e.g. 'database preferences', 'project setup rules')."),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of relevant memories to retrieve (default: 5)."),
  }),
  func: async ({ query, limit = 5 }) => {
    try {
      const results = await searchRelevantMemories(query, limit, 0.25);
      if (results.length === 0) {
        return JSON.stringify({
          query,
          count: 0,
          message: "No relevant long-term memories found for this query.",
          memories: [],
        });
      }

      return JSON.stringify({
        query,
        count: results.length,
        memories: results.map((m) => ({
          id: m.id,
          category: m.category,
          content: m.content,
          similarity: m.similarity !== undefined ? Number(m.similarity.toFixed(3)) : undefined,
        })),
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: error.message || "Failed to search memories",
      });
    }
  },
});

/**
 * Tool: forget_memory
 * Remove an outdated or retracted memory by its ID.
 */
export const forgetMemoryTool = new DynamicStructuredTool({
  name: "forget_memory",
  description:
    "Remove or forget an outdated, retracted, or incorrect piece of long-term memory using its memory ID.",
  schema: z.object({
    memoryId: z.string().describe("The UUID identifier of the memory to remove."),
  }),
  func: async ({ memoryId }) => {
    try {
      const deleted = await deleteMemory(memoryId);
      return JSON.stringify({
        success: deleted,
        message: deleted
          ? `Successfully removed memory with ID: ${memoryId}`
          : `Memory with ID ${memoryId} was not found.`,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to delete memory",
      });
    }
  },
});

export const memoryTools = [saveMemoryTool, recallMemoriesTool, forgetMemoryTool];
