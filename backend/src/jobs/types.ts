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
  artifacts?: Array<{
    name: string;
    path?: string;
    preview?: string;
  }>;
  error?: string;
  durationMs: number;
}

export interface JobPayload {
  type: JobType;
  title?: string;
  targetPath?: string;
  options?: {
    includeTests?: boolean;
    maxFiles?: number;
    fileExtensions?: string[];
    deepLlmAudit?: boolean;
    [key: string]: any;
  };
  documents?: Array<{
    id?: string;
    text: string;
    category?: string;
    tags?: string[];
  }>;
  userId?: string | null;
  threadId?: string | null;
}

export interface AssistantJobRecord {
  id: string;
  type: JobType;
  title: string;
  status: JobStatus;
  userId: string | null;
  threadId: string | null;
  payload: JobPayload;
  progress: JobProgress;
  result: JobResult | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}
