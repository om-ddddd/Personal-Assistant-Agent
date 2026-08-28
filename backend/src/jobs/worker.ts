import fs from "fs";
import path from "path";
import { Worker, Job } from "bullmq";
import { getRedisClient, isRedisConnected } from "./redis.js";
import {
  ASSISTANT_QUEUE_NAME,
  updateJobProgress,
  updateJobStatus,
  getJobDetails,
} from "./queue.js";
import {
  AssistantJobRecord,
  JobMetricSummary,
  JobPayload,
  JobResult,
} from "./types.js";
import { resolveSafeCwd } from "../tools/terminal.js";
import { saveMemory } from "../memory/long-term.js";

let bullWorker: Worker | null = null;
let isWorkerRunning = false;

// Ignored patterns for workspace analysis
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".gemini",
  ".vscode",
  ".system_generated",
  "coverage",
]);

/**
 * Recursively discover all code files in target directory with safety limits.
 */
function discoverWorkspaceFiles(
  dir: string,
  maxFiles = 200,
  extensions?: string[]
): string[] {
  const results: string[] = [];

  function scan(currentDir: string) {
    if (results.length >= maxFiles) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions && extensions.length > 0) {
          if (extensions.includes(ext)) {
            results.push(fullPath);
          }
        } else {
          // Standard code files
          if (
            [
              ".ts",
              ".tsx",
              ".js",
              ".jsx",
              ".json",
              ".py",
              ".css",
              ".html",
              ".md",
              ".sql",
              ".yml",
              ".yaml",
            ].includes(ext)
          ) {
            results.push(fullPath);
          }
        }
      }
    }
  }

  scan(dir);
  return results;
}

/**
 * Execute Repository Batch Analysis.
 */
export async function executeRepoAnalysis(
  jobId: string,
  payload: JobPayload
): Promise<JobResult> {
  const startTime = Date.now();
  const rootDir = resolveSafeCwd(payload.targetPath || ".");

  // Stage 1: File Discovery (15%)
  await updateJobProgress(jobId, {
    percentage: 15,
    stage: "DISCOVERY",
    message: `Scanning workspace files in: ${path.basename(rootDir)}...`,
  });

  const maxFiles = payload.options?.maxFiles || 150;
  const files = discoverWorkspaceFiles(
    rootDir,
    maxFiles,
    payload.options?.fileExtensions
  );

  // Stage 2: Code Metrics & Language Breakdown (45%)
  await updateJobProgress(jobId, {
    percentage: 45,
    stage: "METRICS",
    message: `Analyzing syntax and line metrics across ${files.length} files...`,
    totalItems: files.length,
    itemsProcessed: 0,
  });

  let totalLines = 0;
  const languageCounts: Record<string, number> = {};
  const securityFindings: Array<{ file: string; line: number; issue: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n").length;
      totalLines += lines;

      const ext = path.extname(file).toLowerCase() || "other";
      languageCounts[ext] = (languageCounts[ext] || 0) + lines;

      // Scan for common security issues
      const linesArr = content.split("\n");
      for (let l = 0; l < linesArr.length; l++) {
        const lineText = linesArr[l];
        if (
          /api[_-]?key\s*=\s*['"][a-zA-Z0-9_\-]{20,}['"]/i.test(lineText) &&
          !file.includes(".env.example")
        ) {
          securityFindings.push({
            file: path.relative(rootDir, file),
            line: l + 1,
            issue: "Possible hardcoded API key",
          });
        }
        if (/eval\s*\(/i.test(lineText) && !file.includes(".test.")) {
          securityFindings.push({
            file: path.relative(rootDir, file),
            line: l + 1,
            issue: "Usage of dangerous eval() statement",
          });
        }
      }
    } catch {
      // Ignore unreadable binary
    }

    if (i % 10 === 0 || i === files.length - 1) {
      await updateJobProgress(jobId, {
        percentage: 45 + Math.round(((i + 1) / files.length) * 35),
        stage: "ANALYZING",
        message: `Processed ${i + 1}/${files.length} files (${path.basename(file)})`,
        itemsProcessed: i + 1,
        totalItems: files.length,
      });
    }
  }

  // Stage 3: Synthesis & Report Generation (90%)
  await updateJobProgress(jobId, {
    percentage: 90,
    stage: "SYNTHESIS",
    message: "Generating structured Markdown architecture report...",
  });

  const durationMs = Date.now() - startTime;
  const metrics: JobMetricSummary = {
    filesAnalyzed: files.length,
    totalLinesOfCode: totalLines,
    languages: languageCounts,
    vulnerabilitiesFound: securityFindings.length,
    qualityScore: Math.max(100 - securityFindings.length * 10, 50),
  };

  // Build Report Markdown
  const langTableRows = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, lines]) => `| \`${lang}\` | ${lines.toLocaleString()} lines | ${((lines / (totalLines || 1)) * 100).toFixed(1)}% |`)
    .join("\n");

  const findingsSection =
    securityFindings.length === 0
      ? "No critical security vulnerabilities or hardcoded secrets detected."
      : securityFindings
          .map(
            (f) =>
              `- **${f.file}** (Line ${f.line}): \`${f.issue}\``
          )
          .join("\n");

  const reportMarkdown = `## Repository Batch Analysis Report

**Target Workspace**: \`${path.basename(rootDir)}\`  
**Analysis Duration**: \`${(durationMs / 1000).toFixed(2)}s\`  
**Health Score**: \`${metrics.qualityScore}/100\`

---

### Codebase Metrics
- **Total Files Scanned**: \`${files.length}\`
- **Total Lines of Code**: \`${totalLines.toLocaleString()}\`
- **Security Findings**: \`${securityFindings.length}\`

### Language & File Type Distribution
| Extension | Lines of Code | Percentage |
| :--- | :--- | :--- |
${langTableRows || "| None | 0 lines | 0% |"}

---

### Security & Quality Audit
${findingsSection}

---

### Recommendations
1. Maintain consistent unit test coverage across core modules.
2. Keep environment variables restricted to \`.env\` files and ensure zero secrets are checked into version control.
3. Continue modular architecture with strict separation between business logic, tools, and UI.
`;

  const summary = `Completed analysis of ${files.length} files (${totalLines.toLocaleString()} lines of code) in ${(durationMs / 1000).toFixed(1)}s. Health score: ${metrics.qualityScore}/100.`;

  const result: JobResult = {
    success: true,
    reportMarkdown,
    summary,
    metrics,
    durationMs,
    artifacts: [
      {
        name: "analysis_report.md",
        preview: summary,
      },
    ],
  };

  await updateJobProgress(jobId, {
    percentage: 100,
    stage: "COMPLETED",
    message: "Analysis completed successfully.",
    itemsProcessed: files.length,
    totalItems: files.length,
  });

  await updateJobStatus(jobId, "COMPLETED", result);

  return result;
}

/**
 * Execute Batch Embedding & Ingestion into pgvector.
 */
export async function executeBatchEmbedding(
  jobId: string,
  payload: JobPayload
): Promise<JobResult> {
  const startTime = Date.now();
  const docs = payload.documents || [];

  await updateJobProgress(jobId, {
    percentage: 10,
    stage: "INGESTING",
    message: `Starting vector embedding for ${docs.length} documents...`,
    totalItems: docs.length,
    itemsProcessed: 0,
  });

  let savedCount = 0;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    try {
      await saveMemory(
        doc.text,
        (doc.category as any) || "project_fact",
        payload.userId || "default_user"
      );
      savedCount++;
    } catch {
      // Ignore individual embedding error
    }

    await updateJobProgress(jobId, {
      percentage: 10 + Math.round(((i + 1) / (docs.length || 1)) * 85),
      stage: "EMBEDDING",
      message: `Embedded document ${i + 1}/${docs.length}`,
      itemsProcessed: i + 1,
      totalItems: docs.length,
    });
  }

  const durationMs = Date.now() - startTime;
  const result: JobResult = {
    success: true,
    reportMarkdown: `### Batch Ingestion Complete\n\n- Successfully embedded **${savedCount}** documents into vector memory.\n- Duration: **${(durationMs / 1000).toFixed(2)}s**`,
    summary: `Ingested ${savedCount} documents into long-term vector memory.`,
    metrics: { itemsProcessed: savedCount, totalItems: docs.length },
    durationMs,
  };

  await updateJobProgress(jobId, {
    percentage: 100,
    stage: "COMPLETED",
    message: `Successfully embedded ${savedCount} documents.`,
    itemsProcessed: savedCount,
    totalItems: docs.length,
  });

  await updateJobStatus(jobId, "COMPLETED", result);

  return result;
}

/**
 * Dispatch job processor based on type.
 */
export async function processJob(jobId: string, payload: JobPayload): Promise<JobResult> {
  const record = await getJobDetails(jobId);
  if (record?.status === "CANCELLED") {
    return {
      success: false,
      reportMarkdown: "Task was cancelled before execution.",
      summary: "Task was cancelled.",
      durationMs: 0,
    };
  }

  await updateJobProgress(jobId, {
    percentage: 5,
    stage: "STARTING",
    message: "Initializing background worker process...",
  });

  try {
    switch (payload.type) {
      case "REPO_ANALYSIS":
      case "CODE_HEALTH_CHECK":
        return await executeRepoAnalysis(jobId, payload);
      case "BATCH_EMBEDDING":
        return await executeBatchEmbedding(jobId, payload);
      case "SECURITY_AUDIT":
        return await executeRepoAnalysis(jobId, {
          ...payload,
          options: { ...payload.options, deepLlmAudit: true },
        });
      default:
        throw new Error(`Unsupported job type: ${payload.type}`);
    }
  } catch (err: any) {
    const errorMsg = err.message || "Unknown error during job execution";
    await updateJobStatus(jobId, "FAILED", null, errorMsg);
    throw err;
  }
}

/**
 * Start the BullMQ Worker and background loop.
 */
export function startJobWorker(): Worker | null {
  if (bullWorker || isWorkerRunning) {
    return bullWorker;
  }

  try {
    const redis = getRedisClient();
    bullWorker = new Worker(
      ASSISTANT_QUEUE_NAME,
      async (job: Job) => {
        const { jobId } = job.data;
        console.log(`[BullMQ:Worker] Processing job ${job.id} (task ${jobId})...`);
        return await processJob(jobId || job.id, job.data);
      },
      {
        connection: redis,
        concurrency: 3,
      }
    );

    bullWorker.on("error", (err) => {
      // Suppress unhandled error crash when Redis is offline
    });

    bullWorker.on("completed", (job) => {
      console.log(`[BullMQ:Worker] Job ${job.id} finished successfully.`);
    });

    bullWorker.on("failed", (job, err) => {
      console.error(`[BullMQ:Worker] Job ${job?.id} failed: ${err.message}`);
    });

    isWorkerRunning = true;
    console.log("[BullMQ:Worker] Background job worker started (concurrency: 3).");
    return bullWorker;
  } catch (err: any) {
    console.warn(`[BullMQ:Worker] Starting in fallback mode: ${err.message}`);
    isWorkerRunning = true;
    return null;
  }
}

/**
 * Stop BullMQ worker on server shutdown.
 */
export async function stopJobWorker(): Promise<void> {
  if (bullWorker) {
    try {
      await bullWorker.close();
    } catch {
      // Ignore
    }
    bullWorker = null;
  }
  isWorkerRunning = false;
}
