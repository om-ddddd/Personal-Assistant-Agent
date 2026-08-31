import { PrismaClient } from "@prisma/client";

/**
 * Global singleton instance of the Prisma Client.
 */
let prismaClientInstance: PrismaClient | null = null;
let isConnected = false;
let connectionChecked = false;

/**
 * Get or initialize the Prisma Client singleton instance.
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaClientInstance) {
    prismaClientInstance = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return prismaClientInstance;
}

export const prisma = getPrismaClient();

/**
 * Check if the PostgreSQL database is reachable via Prisma.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  if (connectionChecked) return isConnected;
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;

    try {
      await client.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          "passwordHash" TEXT NOT NULL,
          name TEXT,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      await client.$executeRawUnsafe(`
        ALTER TABLE threads ADD COLUMN IF NOT EXISTS "userId" TEXT;
      `);
      await client.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_settings (
          id TEXT PRIMARY KEY,
          "userId" TEXT UNIQUE NOT NULL,
          "workspacePath" TEXT,
          "llmKeys" JSONB,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      await client.$executeRawUnsafe(`
        ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS "llmKeys" JSONB;
      `);
    } catch {
      // ignore table sync warning
    }

    isConnected = true;
    console.log("[Database] PostgreSQL connection established successfully via Prisma.");
  } catch (err: unknown) {
    isConnected = false;
    const error = err as Error;
    console.warn(
      `[Database] PostgreSQL is not reachable (${error.message.split("\n")[0]}). Operating with resilient in-memory fallback.`
    );
  } finally {
    connectionChecked = true;
  }
  return isConnected;
}

/**
 * Check if database is currently considered connected.
 */
export function isDatabaseConnected(): boolean {
  return isConnected;
}

/**
 * Gracefully disconnect Prisma client on application shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaClientInstance) {
    await prismaClientInstance.$disconnect();
    isConnected = false;
    connectionChecked = false;
  }
}
