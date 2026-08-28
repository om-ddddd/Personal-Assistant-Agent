import { Redis, RedisOptions } from "ioredis";

let redisClient: Redis | null = null;
let isConnected = false;
let connectionAttempted = false;

export function getRedisConfig(): RedisOptions {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 4000,
    retryStrategy: (times: number) => {
      if (times > 5) {
        return null; // Stop retrying after 5 attempts to enable graceful fallback
      }
      return Math.min(times * 200, 2000);
    },
  };
}

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  redisClient = new Redis(redisUrl, getRedisConfig());

  redisClient.on("connect", () => {
    isConnected = true;
    console.log("[Redis] Connected to Redis 8 instance successfully.");
  });

  redisClient.on("ready", () => {
    isConnected = true;
  });

  redisClient.on("error", (err: Error) => {
    isConnected = false;
    // Suppress repeated spam logs if Redis is not running locally
    if (!connectionAttempted) {
      console.warn(`[Redis] Redis connection issue: ${err.message}. Operating with in-memory fallback.`);
      connectionAttempted = true;
    }
  });

  redisClient.on("close", () => {
    isConnected = false;
  });

  return redisClient;
}

export async function checkRedisHealth(): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    const pong = await client.ping();
    if (pong === "PONG") {
      isConnected = true;
      const info = await client.info("server");
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      return {
        connected: true,
        version: versionMatch ? versionMatch[1] : "8.0",
      };
    }
    return { connected: false, error: "Ping did not return PONG" };
  } catch (err: any) {
    isConnected = false;
    return { connected: false, error: err.message || "Failed to reach Redis server" };
  }
}

export function isRedisConnected(): boolean {
  return isConnected;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
    isConnected = false;
  }
}
