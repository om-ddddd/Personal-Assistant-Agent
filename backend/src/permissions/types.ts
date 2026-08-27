/**
 * Permission system core type definitions.
 *
 * Every tool is classified by risk level, and WRITE/DESTRUCTIVE
 * operations require human-in-the-loop confirmation before execution.
 */

/**
 * Risk classification for agent tools.
 * - READ: safe, information-retrieval only, executes immediately
 * - WRITE: creates or modifies external state, requires HITL confirmation
 * - DESTRUCTIVE: irreversible deletion or dangerous mutation, requires HITL with danger warning
 */
export enum ToolRiskLevel {
  READ = "READ",
  WRITE = "WRITE",
  DESTRUCTIVE = "DESTRUCTIVE",
}

/**
 * Registry entry associating a tool name with its risk classification.
 */
export interface ToolPermissionEntry {
  toolName: string;
  riskLevel: ToolRiskLevel;
  description: string;
}

/**
 * Result of a permission check for a tool invocation.
 */
export interface PermissionDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  riskLevel: ToolRiskLevel;
  toolName: string;
}

/**
 * Status of a pending HITL confirmation request.
 */
export enum ConfirmationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}

/**
 * A pending human-in-the-loop confirmation request for a tool call
 * that was intercepted by the permission gate.
 */
export interface PendingConfirmation {
  /** Unique identifier for this confirmation request */
  id: string;
  /** The LangGraph thread that is paused waiting for this decision */
  threadId: string;
  /** Name of the tool awaiting confirmation */
  toolName: string;
  /** Arguments the agent intends to pass to the tool */
  toolArgs: Record<string, unknown>;
  /** Risk classification of the tool */
  riskLevel: ToolRiskLevel;
  /** Human-readable description of what the tool will do */
  description: string;
  /** Current status */
  status: ConfirmationStatus;
  /** ISO timestamp when the confirmation was created */
  createdAt: string;
  /** ISO timestamp when the confirmation was resolved (approved/rejected/expired) */
  resolvedAt?: string;
}
