import { Queue, QueueOptions } from "bullmq";
import { getRedisClient, isRedisConnected, getRedisConfig } from "./redis.js";
import {
  AssistantJobRecord,
  JobPayload,
  JobProgress,
  JobResult,
  JobStatus,
  JobType,
} from "./types.js";

export const ASSISTANT_QUEUE_NAME = "assistant-background-jobs";

let bullQueue: Queue | null = null;
const inMemoryJobStore = new Map<string, AssistantJobRecord>();

export function getBullQueue(): Queue | null {
  if (bullQueue) {
    return bullQueue;
  }

  try {
    const redis = getRedisClient();
    const queueOptions: QueueOptions = {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600 * 24, // Keep completed jobs for 24 hours
          count: 500,
        },
        removeOnFail: {
          age: 3600 * 48,
          count: 500,
        },
      },
    };

    bullQueue = new Queue(ASSISTANT_QUEUE_NAME, queueOptions);
    bullQueue.on("error", (err) => {
      console.warn(`[BullMQ:Queue] Warning: ${err.message}`);
    });

    return bullQueue;
  } catch (err: any) {
    console.warn(`[BullMQ:Queue] Initializing in fallback mode: ${err.message}`);
    return null;
  }
}

/**
 * Enqueue a new background job.
 */
export async function enqueueAssistantJob(
  payload: JobPayload,
  userId: string | null = null
): Promise<AssistantJobRecord> {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const title =
    payload.title ||
    `${payload.type.replace(/_/g, " ")} (${payload.targetPath || "Workspace"})`;

  const initialProgress: JobProgress = {
    percentage: 0,
    stage: "QUEUED",
    message: "Task has been enqueued and is waiting for an available worker.",
    itemsProcessed: 0,
    totalItems: 0,
    updatedAt: now,
  };

  const jobRecord: AssistantJobRecord = {
    id: jobId,
    type: payload.type,
    title,
    status: "PENDING",
    userId: userId || payload.userId || null,
    threadId: payload.threadId || null,
    payload: {
      ...payload,
      userId: userId || payload.userId || null,
    },
    progress: initialProgress,
    result: null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  };

  inMemoryJobStore.set(jobId, jobRecord);

  // If Redis is active, dispatch through BullMQ
  const queue = getBullQueue();
  if (queue && isRedisConnected()) {
    try {
      await queue.add(payload.type, { ...payload, jobId, userId }, { jobId });
      console.log(`[BullMQ] Job ${jobId} (${payload.type}) added to Redis 8 queue.`);
    } catch (err: any) {
      console.warn(`[BullMQ] Failed to add to Redis queue: ${err.message}. Running via in-memory worker.`);
    }
  }

  return jobRecord;
}

/**
 * Get job details by ID with optional user authorization check.
 */
export async function getJobDetails(
  jobId: string,
  userId: string | null = null
): Promise<AssistantJobRecord | null> {
  const record = inMemoryJobStore.get(jobId);
  if (!record) {
    return null;
  }

  // Cross-user isolation check:
  // If request is authenticated, job must belong to user or be unassigned.
  // If job has a specific userId, mismatched user is denied.
  if (record.userId && userId && record.userId !== userId) {
    return null;
  }
  if (record.userId && !userId) {
    return null; // Guest cannot view authenticated user's job
  }

  return record;
}

/**
 * List all background jobs for a specific user.
 */
export async function listUserJobs(
  userId: string | null = null,
  statusFilter?: JobStatus
): Promise<AssistantJobRecord[]> {
  const jobs: AssistantJobRecord[] = [];

  for (const job of inMemoryJobStore.values()) {
    // User scoping logic
    if (userId) {
      if (job.userId === userId) {
        if (!statusFilter || job.status === statusFilter) {
          jobs.push(job);
        }
      }
    } else {
      // Unauthenticated / guest only sees unauthenticated jobs
      if (!job.userId) {
        if (!statusFilter || job.status === statusFilter) {
          jobs.push(job);
        }
      }
    }
  }

  // Sort newest first
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Update the real-time progress of a job.
 */
export async function updateJobProgress(
  jobId: string,
  progressUpdate: Partial<JobProgress>
): Promise<void> {
  const record = inMemoryJobStore.get(jobId);
  if (record) {
    record.progress = {
      ...record.progress,
      ...progressUpdate,
      updatedAt: new Date().toISOString(),
    };
    if (record.status === "PENDING" && (progressUpdate.percentage || 0) > 0) {
      record.status = "ACTIVE";
      if (!record.startedAt) {
        record.startedAt = new Date().toISOString();
      }
    }
  }
}

/**
 * Update the final status and result of a job.
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  result: JobResult | null = null,
  error?: string
): Promise<void> {
  const record = inMemoryJobStore.get(jobId);
  if (record) {
    record.status = status;
    record.completedAt = new Date().toISOString();
    if (result) {
      record.result = result;
    } else if (error) {
      record.result = {
        success: false,
        reportMarkdown: `### Job Failed\n\n**Error**: ${error}`,
        summary: `Job encountered an error: ${error}`,
        error,
        durationMs: record.startedAt
          ? Date.now() - new Date(record.startedAt).getTime()
          : 0,
      };
    }
  }
}

/**
 * Cancel an active or pending background job.
 */
export async function cancelAssistantJob(
  jobId: string,
  userId: string | null = null
): Promise<boolean> {
  const record = inMemoryJobStore.get(jobId);
  if (!record) {
    return false;
  }

  // Authorization check
  if (record.userId && userId && record.userId !== userId) {
    return false;
  }
  if (record.userId && !userId) {
    return false;
  }

  if (record.status === "COMPLETED" || record.status === "FAILED") {
    return false;
  }

  record.status = "CANCELLED";
  record.progress.stage = "CANCELLED";
  record.progress.message = "Task was cancelled by user.";
  record.progress.updatedAt = new Date().toISOString();
  record.completedAt = new Date().toISOString();

  // Also remove from BullMQ if possible
  const queue = getBullQueue();
  if (queue) {
    try {
      const bullJob = await queue.getJob(jobId);
      if (bullJob) {
        await bullJob.remove();
      }
    } catch {
      // Ignore
    }
  }

  return true;
}
