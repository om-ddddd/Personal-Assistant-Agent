export type JobType =
  | "REPO_ANALYSIS"
  | "SECURITY_AUDIT"
  | "BATCH_EMBEDDING"
  | "CODE_HEALTH_CHECK";

export type JobStatus =
  | "PENDING"
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface JobProgress {
  percentage: number;
  stage: string;
  message: string;
  itemsProcessed?: number;
  totalItems?: number;
  updatedAt: string;
}

export interface JobMetricSummary {
  filesAnalyzed?: number;
  totalLinesOfCode?: number;
  languages?: Record<string, number>;
  vulnerabilitiesFound?: number;
  qualityScore?: number;
  [key: string]: any;
}

export interface JobResult {
  success: boolean;
  reportMarkdown: string;
  summary: string;
  metrics?: JobMetricSummary;
  durationMs: number;
}

export interface AssistantJobRecord {
  id: string;
  type: JobType;
  title: string;
  status: JobStatus;
  userId: string | null;
  threadId: string | null;
  progress: JobProgress;
  result: JobResult | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface JobPayload {
  type: JobType;
  title?: string;
  targetPath?: string;
  options?: Record<string, any>;
  documents?: Array<{ text: string; category?: string }>;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

/**
 * Fetch all background jobs for the active user.
 */
export async function fetchUserJobs(
  statusFilter?: JobStatus
): Promise<AssistantJobRecord[]> {
  try {
    const url = new URL(`${BACKEND_URL}/api/jobs`);
    if (statusFilter) {
      url.searchParams.set("status", statusFilter);
    }
    const res = await fetch(url.toString(), {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}

/**
 * Fetch detailed state and progress for a single job.
 */
export async function fetchJobDetails(
  jobId: string
): Promise<AssistantJobRecord | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Enqueue a new background task.
 */
export async function enqueueJob(
  payload: JobPayload
): Promise<AssistantJobRecord | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/jobs`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Cancel an ongoing or pending background job.
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
