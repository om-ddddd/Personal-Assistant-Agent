import crypto from "crypto";
import { prisma, isDatabaseConnected, checkDatabaseConnection } from "../db/prisma.js";
import { embedText, EMBEDDING_DIMENSION } from "./embeddings.js";

export interface LongTermMemoryItem {
  id: string;
  userId: string;
  content: string;
  category: string;
  similarity?: number;
  createdAt?: string;
}

/**
 * In-memory L1 cache of long-term memories for fallback & fast lookup.
 */
const inMemoryLongTermStore: LongTermMemoryItem[] = [];
let pgVectorInitialized = false;

/**
 * Initialize pgvector extension and user_memories table in PostgreSQL.
 */
export async function initPgVectorSchema(): Promise<boolean> {
  if (pgVectorInitialized) return true;

  const isLive = await checkDatabaseConnection();
  if (!isLive) {
    console.log("[LongTermMemory] Operating in in-memory mode for semantic vector storage.");
    return false;
  }

  try {
    // 1. Enable pgvector extension
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // 2. Create user_memories table with 2048-dim vector column
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL DEFAULT 'default_user',
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        embedding vector(${EMBEDDING_DIMENSION}),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 3. Create index for fast cosine search if dimension <= 2000
    if (EMBEDDING_DIMENSION <= 2000) {
      try {
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS user_memories_embedding_hnsw_idx 
          ON user_memories 
          USING hnsw (embedding vector_cosine_ops);
        `);
      } catch {}
    }

    pgVectorInitialized = true;
    console.log(`[LongTermMemory] PostgreSQL pgvector schema initialized (dimension: ${EMBEDDING_DIMENSION}).`);
    return true;
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(`[LongTermMemory] Failed to initialize pgvector schema (${error.message}). Using fallback memory store.`);
    return false;
  }
}

export const DEDUPLICATION_SIMILARITY_THRESHOLD = 0.85;

/**
 * Save a durable memory into PostgreSQL with high-dimensional embedding and automatic deduplication.
 * If a semantically similar (cosine similarity >= 0.85) or exact-match memory already exists,
 * it updates the existing record instead of inserting a duplicate.
 */
export async function saveLongTermMemory(
  content: string,
  category: string = "preference",
  userId: string = "default_user",
  deduplicate: boolean = true
): Promise<LongTermMemoryItem> {
  const cleanContent = content.trim();
  if (!cleanContent) {
    throw new Error("Memory content cannot be empty.");
  }

  // Generate high-quality embedding vector
  const embedding = await embedText(cleanContent, "passage");
  const embeddingStr = `[${embedding.join(",")}]`;

  // --- Step 1: Deduplication Check ---
  if (deduplicate) {
    if (isDatabaseConnected()) {
      try {
        await initPgVectorSchema();
        const existingMatches: Array<{
          id: string;
          user_id: string;
          content: string;
          category: string;
          created_at: Date;
          similarity: number;
        }> = await prisma.$queryRawUnsafe(
          `
          SELECT 
            id,
            user_id,
            content,
            category,
            created_at,
            1 - (embedding <=> $1::vector) AS similarity
          FROM user_memories
          WHERE user_id = $2
          ORDER BY embedding <=> $1::vector
          LIMIT 1;
        `,
          embeddingStr,
          userId
        );

        if (existingMatches && existingMatches.length > 0) {
          const topMatch = existingMatches[0];
          const isExactMatch = topMatch.content.trim().toLowerCase() === cleanContent.toLowerCase();
          const isSemanticDuplicate = topMatch.similarity >= DEDUPLICATION_SIMILARITY_THRESHOLD;

          if (isExactMatch || isSemanticDuplicate) {
            console.log(
              `[LongTermMemory] Deduplication: match found ("${topMatch.content.slice(0, 40)}...", sim: ${topMatch.similarity.toFixed(3)}). Updating existing record ${topMatch.id}.`
            );

            // Update existing memory row with newest content & embedding
            const updatedRows: Array<{
              id: string;
              user_id: string;
              content: string;
              category: string;
              created_at: Date;
            }> = await prisma.$queryRawUnsafe(
              `
              UPDATE user_memories
              SET content = $1, category = $2, embedding = $3::vector, updated_at = now()
              WHERE id = $4::uuid
              RETURNING id, user_id, content, category, created_at;
            `,
              cleanContent,
              category,
              embeddingStr,
              topMatch.id
            );

            const updatedItem: LongTermMemoryItem = {
              id: String(topMatch.id),
              userId,
              content: cleanContent,
              category,
              createdAt: updatedRows[0]?.created_at.toISOString() || topMatch.created_at.toISOString(),
            };

            // Sync in-memory cache
            const cacheIdx = inMemoryLongTermStore.findIndex((m) => m.id === String(topMatch.id));
            if (cacheIdx !== -1) {
              inMemoryLongTermStore[cacheIdx] = updatedItem;
            } else {
              inMemoryLongTermStore.push(updatedItem);
            }

            return updatedItem;
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.warn(`[LongTermMemory] Deduplication lookup warning (${error.message}). Proceeding to insert.`);
      }
    } else {
      // In-Memory fallback deduplication
      const existingIdx = inMemoryLongTermStore.findIndex(
        (m) => m.userId === userId && m.content.toLowerCase() === cleanContent.toLowerCase()
      );
      if (existingIdx !== -1) {
        inMemoryLongTermStore[existingIdx].content = cleanContent;
        inMemoryLongTermStore[existingIdx].category = category;
        return inMemoryLongTermStore[existingIdx];
      }
    }
  }

  // --- Step 2: Insert New Unique Memory ---
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const item: LongTermMemoryItem = {
    id,
    userId,
    content: cleanContent,
    category,
    createdAt: now,
  };

  inMemoryLongTermStore.push(item);

  if (isDatabaseConnected()) {
    try {
      await initPgVectorSchema();
      const result: Array<{ id: string; user_id: string; content: string; category: string; created_at: Date }> =
        await prisma.$queryRawUnsafe(
          `
          INSERT INTO user_memories (id, user_id, content, category, embedding)
          VALUES ($1::uuid, $2, $3, $4, $5::vector)
          RETURNING id, user_id, content, category, created_at;
        `,
          id,
          userId,
          cleanContent,
          category,
          embeddingStr
        );

      if (result && result[0]) {
        console.log(`[LongTermMemory] Stored new memory "${cleanContent.slice(0, 50)}..." (${category}) in pgvector.`);
        return {
          id: String(result[0].id),
          userId: result[0].user_id,
          content: result[0].content,
          category: result[0].category,
          createdAt: result[0].created_at.toISOString(),
        };
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.warn(`[LongTermMemory] Error inserting into pgvector table: ${error.message}`);
    }
  }

  return item;
}

/**
 * Perform semantic cosine similarity search across long-term memories.
 */
export async function searchRelevantMemories(
  query: string,
  limit: number = 4,
  similarityThreshold: number = 0.35,
  userId: string = "default_user"
): Promise<LongTermMemoryItem[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const queryEmbedding = await embedText(cleanQuery, "query");
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  if (isDatabaseConnected()) {
    try {
      await initPgVectorSchema();
      const rows: Array<{
        id: string;
        user_id: string;
        content: string;
        category: string;
        created_at: Date;
        similarity: number;
      }> = await prisma.$queryRawUnsafe(
        `
        SELECT 
          id,
          user_id,
          content,
          category,
          created_at,
          1 - (embedding <=> $1::vector) AS similarity
        FROM user_memories
        WHERE user_id = $2 AND (1 - (embedding <=> $1::vector)) >= $3
        ORDER BY embedding <=> $1::vector
        LIMIT $4;
      `,
        embeddingStr,
        userId,
        similarityThreshold,
        limit
      );

      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          id: String(r.id),
          userId: r.user_id,
          content: r.content,
          category: r.category,
          similarity: Number(r.similarity),
          createdAt: r.created_at.toISOString(),
        }));
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.warn(`[LongTermMemory] pgvector similarity search error: ${error.message}`);
    }
  }

  // Fallback: simple text match in in-memory store
  const lowerQuery = cleanQuery.toLowerCase();
  return inMemoryLongTermStore
    .filter((m) => m.userId === userId && m.content.toLowerCase().includes(lowerQuery))
    .slice(0, limit);
}

/**
 * List all persistent memories for a given user.
 */
export async function listAllMemories(userId: string = "default_user"): Promise<LongTermMemoryItem[]> {
  if (isDatabaseConnected()) {
    try {
      await initPgVectorSchema();
      const rows: Array<{
        id: string;
        user_id: string;
        content: string;
        category: string;
        created_at: Date;
      }> = await prisma.$queryRawUnsafe(
        `
        SELECT id, user_id, content, category, created_at
        FROM user_memories
        WHERE user_id = $1
        ORDER BY created_at DESC;
      `,
        userId
      );

      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          id: String(r.id),
          userId: r.user_id,
          content: r.content,
          category: r.category,
          createdAt: r.created_at.toISOString(),
        }));
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.warn(`[LongTermMemory] Error listing memories: ${error.message}`);
    }
  }

  return inMemoryLongTermStore.filter((m) => m.userId === userId);
}

/**
 * Delete a specific memory by its UUID.
 */
export async function deleteMemory(id: string): Promise<boolean> {
  const index = inMemoryLongTermStore.findIndex((m) => m.id === id);
  if (index !== -1) {
    inMemoryLongTermStore.splice(index, 1);
  }

  if (isDatabaseConnected()) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM user_memories WHERE id = $1::uuid;`,
        id
      );
      return true;
    } catch {
      return false;
    }
  }

  return index !== -1;
}

/**
 * Formats retrieved long-term memories into markdown for system prompt injection.
 */
export function formatLongTermMemoriesForPrompt(memories: LongTermMemoryItem[]): string {
  if (!memories || memories.length === 0) {
    return "";
  }

  const lines = memories.map((m) => `- [${m.category.toUpperCase()}] ${m.content}`);
  return `

## Long-Term User Profile & Cross-Thread Knowledge:
The following persistent facts, user preferences, and project rules have been recalled across conversation threads:
${lines.join("\n")}`;
}
