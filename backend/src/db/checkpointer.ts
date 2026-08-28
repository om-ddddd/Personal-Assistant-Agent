import pg from "pg";
import {
  MemorySaver,
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
} from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { checkDatabaseConnection } from "./prisma.js";

const { Pool } = pg;

let checkpointerInstance: BaseCheckpointSaver | null = null;
const memorySaverFallback = new MemorySaver();

/**
 * Resilient Checkpoint Saver that wraps PostgresSaver with automatic MemorySaver fallback.
 * Limits pg.Pool to max 2 connections to avoid Supabase pooler exhaustion (EMAXCONNSESSION).
 */
class ResilientPostgresSaver extends BaseCheckpointSaver {
  private pgSaver: PostgresSaver;
  private memSaver: MemorySaver;
  private isPostgresHealthy: boolean = true;

  constructor(pgSaver: PostgresSaver, memSaver: MemorySaver) {
    super();
    this.pgSaver = pgSaver;
    this.memSaver = memSaver;
  }

  async getTuple(config: any): Promise<CheckpointTuple | undefined> {
    if (this.isPostgresHealthy) {
      try {
        const tuple = await this.pgSaver.getTuple(config);
        if (tuple) return tuple;
      } catch (err: any) {
        console.warn(`[Checkpointer] Postgres getTuple failed (${err.message}). Using in-memory state.`);
        this.isPostgresHealthy = false;
      }
    }
    return this.memSaver.getTuple(config);
  }

  async *list(config: any, options?: any): AsyncGenerator<CheckpointTuple> {
    if (this.isPostgresHealthy) {
      try {
        for await (const tuple of this.pgSaver.list(config, options)) {
          yield tuple;
        }
        return;
      } catch (err: any) {
        console.warn(`[Checkpointer] Postgres list failed (${err.message}). Falling back to in-memory.`);
        this.isPostgresHealthy = false;
      }
    }
    for await (const tuple of this.memSaver.list(config, options)) {
      yield tuple;
    }
  }

  async put(
    config: any,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions?: any
  ): Promise<any> {
    // Always mirror to in-memory store
    const memResult = await (this.memSaver as any).put(config, checkpoint, metadata, newVersions);

    if (this.isPostgresHealthy) {
      try {
        return await (this.pgSaver as any).put(config, checkpoint, metadata, newVersions);
      } catch (err: any) {
        console.warn(`[Checkpointer] Postgres put failed (${err.message}). Checkpoint saved to memory.`);
        this.isPostgresHealthy = false;
      }
    }

    return memResult;
  }

  async putWrites(config: any, writes: any[], taskId: string): Promise<void> {
    // Always mirror writes to in-memory store
    try {
      await (this.memSaver as any).putWrites(config, writes, taskId);
    } catch {
      // Ignore in-memory putWrites error
    }

    if (this.isPostgresHealthy) {
      try {
        await this.pgSaver.putWrites(config, writes, taskId);
      } catch (err: any) {
        console.warn(`[Checkpointer] Postgres putWrites failed (${err.message}). Writes saved to memory.`);
        this.isPostgresHealthy = false;
      }
    }
  }
}

/**
 * Initializes and returns the LangGraph checkpointer.
 * Uses a lightweight (max 2 connection) pool for PostgresSaver with dual in-memory mirror.
 */
export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  const isDbLive = await checkDatabaseConnection();

  if (isDbLive && databaseUrl) {
    try {
      const pool = new Pool({
        connectionString: databaseUrl,
        max: 2, // Strict low pool size to protect Supabase 15-connection limit
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
      });

      pool.on("error", (err) => {
        console.warn(`[Checkpointer:Pool] Pool connection warning: ${err.message}`);
      });

      const postgresSaver = new PostgresSaver(pool);
      await postgresSaver.setup();
      console.log("[Checkpointer] LangGraph PostgresSaver initialized (pool max: 2) with tables verified.");

      checkpointerInstance = new ResilientPostgresSaver(postgresSaver, memorySaverFallback);
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

export { memorySaverFallback };
