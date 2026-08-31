import { prisma, isDatabaseConnected } from "../db/prisma.js";

export interface UserLlmKeys {
  groqApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  nvidiaApiKey?: string;
  nvidiaBaseUrl?: string;
  ollamaBaseUrl?: string;
  defaultModelId?: string;
}

export interface MaskedUserLlmKeys {
  groqApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  nvidiaApiKey?: string;
  nvidiaBaseUrl?: string;
  ollamaBaseUrl?: string;
  defaultModelId?: string;
  hasGroq: boolean;
  hasOpenai: boolean;
  hasAnthropic: boolean;
  hasGoogle: boolean;
  hasNvidia: boolean;
  serverDefaults: {
    hasGroq: boolean;
    hasOpenai: boolean;
    hasAnthropic: boolean;
    hasGoogle: boolean;
    hasNvidia: boolean;
    ollamaBaseUrl: string;
  };
}

/**
 * In-memory fallback stores when the DB is unavailable.
 */
const inMemoryWorkspaceStore = new Map<string, string>();
const inMemoryLlmKeysStore = new Map<string, UserLlmKeys>();

/**
 * Helper to mask sensitive API keys for safe UI display (e.g., "gsk_••••••••abcd")
 */
export function maskApiKey(key?: string): string {
  if (!key || typeof key !== "string" || !key.trim()) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••••";
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

/**
 * Retrieve the user's configured workspace path from the database.
 */
export async function getWorkspacePath(userId: string): Promise<string | null> {
  if (!userId) return null;

  if (isDatabaseConnected()) {
    try {
      const rows: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT "workspacePath" FROM user_settings WHERE "userId" = $1 LIMIT 1`,
        userId
      );
      if (rows && rows.length > 0 && rows[0].workspacePath) {
        return rows[0].workspacePath;
      }
    } catch (err) {
      console.warn("[UserSettings] DB read failed, falling back to memory:", err);
    }
  }

  return inMemoryWorkspaceStore.get(userId) ?? null;
}

/**
 * Persist the user's workspace path to the database.
 */
export async function setWorkspacePath(userId: string, workspacePath: string): Promise<void> {
  if (!userId) throw new Error("userId is required to save workspace path.");

  inMemoryWorkspaceStore.set(userId, workspacePath);

  if (isDatabaseConnected()) {
    try {
      await (prisma as any).$executeRawUnsafe(
        `INSERT INTO user_settings (id, "userId", "workspacePath", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())
         ON CONFLICT ("userId") DO UPDATE SET "workspacePath" = $2, "updatedAt" = NOW()`,
        userId,
        workspacePath
      );
    } catch (err) {
      console.warn("[UserSettings] DB write failed, persisted to memory only:", err);
    }
  }
}

/**
 * Clear the user's custom workspace path, reverting to the system default.
 */
export async function clearWorkspacePath(userId: string): Promise<void> {
  if (!userId) return;

  inMemoryWorkspaceStore.delete(userId);

  if (isDatabaseConnected()) {
    try {
      await (prisma as any).$executeRawUnsafe(
        `UPDATE user_settings SET "workspacePath" = NULL, "updatedAt" = NOW() WHERE "userId" = $1`,
        userId
      );
    } catch {
      // Ignore
    }
  }
}

/**
 * Retrieve raw LLM keys for a specific user to configure runtime model invocations.
 */
export async function getUserLlmKeys(userId: string): Promise<UserLlmKeys> {
  if (!userId) return {};

  if (isDatabaseConnected()) {
    try {
      const rows: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT "llmKeys" FROM user_settings WHERE "userId" = $1 LIMIT 1`,
        userId
      );
      if (rows && rows.length > 0 && rows[0].llmKeys) {
        const raw = rows[0].llmKeys;
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch (err) {
      console.warn("[UserSettings] Failed to read user LLM keys from DB:", err);
    }
  }

  return inMemoryLlmKeysStore.get(userId) || {};
}

/**
 * Retrieve masked LLM keys safe for frontend display.
 */
export async function getMaskedUserLlmKeys(userId: string): Promise<MaskedUserLlmKeys> {
  const userKeys = await getUserLlmKeys(userId);

  const hasGroq = !!userKeys.groqApiKey || !!process.env.GROQ_API_KEY;
  const hasOpenai = !!userKeys.openaiApiKey || !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!userKeys.anthropicApiKey || !!process.env.ANTHROPIC_API_KEY;
  const hasGoogle = !!userKeys.googleApiKey || !!process.env.GOOGLE_GENAI_API_KEY;
  const hasNvidia = !!userKeys.nvidiaApiKey || !!process.env.NVIDIA_API_KEY;

  return {
    groqApiKey: maskApiKey(userKeys.groqApiKey),
    openaiApiKey: maskApiKey(userKeys.openaiApiKey),
    anthropicApiKey: maskApiKey(userKeys.anthropicApiKey),
    googleApiKey: maskApiKey(userKeys.googleApiKey),
    nvidiaApiKey: maskApiKey(userKeys.nvidiaApiKey),
    nvidiaBaseUrl: userKeys.nvidiaBaseUrl || process.env.NVIDIA_BASE_URL || "",
    ollamaBaseUrl: userKeys.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    defaultModelId: userKeys.defaultModelId,
    hasGroq,
    hasOpenai,
    hasAnthropic,
    hasGoogle,
    hasNvidia,
    serverDefaults: {
      hasGroq: !!process.env.GROQ_API_KEY,
      hasOpenai: !!process.env.OPENAI_API_KEY,
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      hasGoogle: !!process.env.GOOGLE_GENAI_API_KEY,
      hasNvidia: !!process.env.NVIDIA_API_KEY,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    },
  };
}

/**
 * Persist updated LLM profile keys for a user.
 */
export async function saveUserLlmKeys(
  userId: string,
  newKeys: Partial<UserLlmKeys>
): Promise<UserLlmKeys> {
  if (!userId) throw new Error("userId is required to save LLM profile keys.");

  const currentKeys = await getUserLlmKeys(userId);
  const updated: UserLlmKeys = {
    ...currentKeys,
  };

  // Only update fields that were explicitly passed
  if (newKeys.groqApiKey !== undefined) {
    updated.groqApiKey = newKeys.groqApiKey.trim() || undefined;
  }
  if (newKeys.openaiApiKey !== undefined) {
    updated.openaiApiKey = newKeys.openaiApiKey.trim() || undefined;
  }
  if (newKeys.anthropicApiKey !== undefined) {
    updated.anthropicApiKey = newKeys.anthropicApiKey.trim() || undefined;
  }
  if (newKeys.googleApiKey !== undefined) {
    updated.googleApiKey = newKeys.googleApiKey.trim() || undefined;
  }
  if (newKeys.nvidiaApiKey !== undefined) {
    updated.nvidiaApiKey = newKeys.nvidiaApiKey.trim() || undefined;
  }
  if (newKeys.nvidiaBaseUrl !== undefined) {
    updated.nvidiaBaseUrl = newKeys.nvidiaBaseUrl.trim() || undefined;
  }
  if (newKeys.ollamaBaseUrl !== undefined) {
    updated.ollamaBaseUrl = newKeys.ollamaBaseUrl.trim() || undefined;
  }
  if (newKeys.defaultModelId !== undefined) {
    updated.defaultModelId = newKeys.defaultModelId.trim() || undefined;
  }

  // Update in-memory cache
  inMemoryLlmKeysStore.set(userId, updated);

  if (isDatabaseConnected()) {
    try {
      await (prisma as any).$executeRawUnsafe(
        `INSERT INTO user_settings (id, "userId", "llmKeys", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2::jsonb, NOW(), NOW())
         ON CONFLICT ("userId") DO UPDATE SET "llmKeys" = $2::jsonb, "updatedAt" = NOW()`,
        userId,
        JSON.stringify(updated)
      );
    } catch (err) {
      console.warn("[UserSettings] Failed to persist user LLM keys to DB:", err);
    }
  }

  return updated;
}

/**
 * Clear user LLM profile keys, reverting to server environment defaults.
 */
export async function clearUserLlmKeys(userId: string): Promise<void> {
  if (!userId) return;

  inMemoryLlmKeysStore.delete(userId);

  if (isDatabaseConnected()) {
    try {
      await (prisma as any).$executeRawUnsafe(
        `UPDATE user_settings SET "llmKeys" = NULL, "updatedAt" = NOW() WHERE "userId" = $1`,
        userId
      );
    } catch {
      // Ignore
    }
  }
}
