import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  enqueueAssistantJob,
  getJobDetails,
  listUserJobs,
  cancelAssistantJob,
} from "../jobs/queue.js";
import { processJob } from "../jobs/worker.js";
import { isRedisConnected } from "../jobs/redis.js";

/**
 * Tool: Enqueue an asynchronous repository batch analysis.
 */
export const startBackgroundRepoAnalysisTool = tool(
  async ({ targetPath = ".", title, maxFiles = 150 }) => {
    try {
      const payload = {
        type: "REPO_ANALYSIS" as const,
        title: title || `Repository Analysis (${targetPath})`,
        targetPath,
        options: { maxFiles },
      };

      const jobRecord = await enqueueAssistantJob(payload, null);

      // If Redis worker is not running, trigger processing asynchronously in background
      if (!isRedisConnected()) {
        setTimeout(() => {
          processJob(jobRecord.id, payload).catch((err) => {
            console.error(`[BackgroundJob] Error processing job ${jobRecord.id}:`, err);
          });
        }, 100);
      }

      return JSON.stringify({
        success: true,
        jobId: jobRecord.id,
        status: "PENDING",
        message: `Background task '${jobRecord.title}' enqueued successfully with ID: ${jobRecord.id}. The analysis is running asynchronously.`,
        instructions: `To check progress, invoke the 'check_background_job_status' tool with jobId='${jobRecord.id}'.`,
      });
    } catch (err: any) {
      return JSON.stringify({
        success: false,
        error: err.message || "Failed to enqueue background repository analysis.",
      });
    }
  },
  {
    name: "start_background_repo_analysis",
    description:
      "Enqueues a heavy asynchronous batch code analysis and security scan of the codebase in the background without blocking the chat conversation. Returns a jobId immediately.",
    schema: z.object({
      targetPath: z
        .string()
        .optional()
        .describe("The folder to analyze relative to workspace root (e.g. '.', 'backend', 'frontend'). Default is '.'"),
      title: z
        .string()
        .optional()
        .describe("A descriptive title for this analysis task."),
      maxFiles: z
        .number()
        .optional()
        .describe("Maximum number of files to scan (default 150)."),
    }),
  }
);

/**
 * Tool: Check status and retrieve report for a background job.
 */
export const checkBackgroundJobStatusTool = tool(
  async ({ jobId }) => {
    try {
      const job = await getJobDetails(jobId, null);
      if (!job) {
        return JSON.stringify({
          success: false,
          error: `Background job with ID '${jobId}' was not found.`,
        });
      }

      return JSON.stringify({
        success: true,
        jobId: job.id,
        type: job.type,
        title: job.title,
        status: job.status,
        progress: {
          percentage: job.progress.percentage,
          stage: job.progress.stage,
          message: job.progress.message,
          itemsProcessed: job.progress.itemsProcessed,
          totalItems: job.progress.totalItems,
        },
        result: job.result
          ? {
              summary: job.result.summary,
              reportMarkdown: job.result.reportMarkdown,
              durationMs: job.result.durationMs,
              metrics: job.result.metrics,
            }
          : null,
      });
    } catch (err: any) {
      return JSON.stringify({
        success: false,
        error: err.message || "Failed to check job status.",
      });
    }
  },
  {
    name: "check_background_job_status",
    description:
      "Checks real-time progress, status, and retrieves the generated Markdown report of an active or completed background job using its jobId.",
    schema: z.object({
      jobId: z.string().describe("The unique jobId returned when the task was enqueued."),
    }),
  }
);

/**
 * Tool: List all background tasks.
 */
export const listBackgroundJobsTool = tool(
  async ({ status }) => {
    try {
      const jobs = await listUserJobs(null, status as any);
      return JSON.stringify({
        success: true,
        total: jobs.length,
        jobs: jobs.map((j) => ({
          id: j.id,
          title: j.title,
          type: j.type,
          status: j.status,
          percentage: j.progress.percentage,
          stage: j.progress.stage,
          createdAt: j.createdAt,
          completedAt: j.completedAt,
        })),
      });
    } catch (err: any) {
      return JSON.stringify({
        success: false,
        error: err.message || "Failed to list background jobs.",
      });
    }
  },
  {
    name: "list_my_background_jobs",
    description:
      "Lists all running, pending, and completed background tasks and their current progress percentages.",
    schema: z.object({
      status: z
        .enum(["PENDING", "ACTIVE", "COMPLETED", "FAILED", "CANCELLED"])
        .optional()
        .describe("Optional filter by job status."),
    }),
  }
);
