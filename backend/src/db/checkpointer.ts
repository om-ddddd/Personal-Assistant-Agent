import { MemorySaver, BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { checkDatabaseConnection, isDatabaseConnected } from "./prisma.js";

let checkpointerInstance: BaseCheckpointSaver | null = null;
const memorySaverFallback = new MemorySaver();

/**
 * Initializes and returns the LangGraph checkpointer.
 * Uses PostgresSaver when PostgreSQL is reachable, otherwise falls back to MemorySaver.
 */
export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const isDbLive = await checkDatabaseConnection();

  if (isDbLive && databaseUrl) {
    try {
      const postgresSaver = PostgresSaver.fromConnString(databaseUrl);
      await postgresSaver.setup();
      console.log("[Checkpointer] LangGraph PostgresSaver initialized and tables verified.");
      checkpointerInstance = postgresSaver;
      return checkpointerInstance;
    } catch (err: unknown) {
      const error = err as Error;
      console.warn(
        `[Checkpointer] Failed to initialize PostgresSaver (${error.message}). Falling back to MemorySaver.`
      );
    }
  }

  console.log("[Checkpointer] Using in-memory checkpointer (MemorySaver).");
  checkpointerInstance = memorySaverFallback;
  return checkpointerInstance;
}

/**
 * Export default memory fallback for synchronous imports if needed.
 */
export { memorySaverFallback };
