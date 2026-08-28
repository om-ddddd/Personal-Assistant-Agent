/**
 * Permission Manager - Pending Confirmation Store.
 *
 * Manages the lifecycle of HITL (human-in-the-loop) confirmation requests.
 * When a WRITE or DESTRUCTIVE tool call is intercepted by the permission gate,
 * a PendingConfirmation is stored here. The frontend polls or receives SSE
 * events to display approval/rejection UI. Once the user decides, the
 * confirmation is resolved and the LangGraph graph resumes.
 */

import crypto from "crypto";
import {
  ToolRiskLevel,
  ConfirmationStatus,
  PendingConfirmation,
} from "./types.js";
import { prisma, isDatabaseConnected } from "../db/prisma.js";

/**
 * In-memory store of pending confirmations keyed by confirmation ID.
 */
const pendingStore = new Map<string, PendingConfirmation>();

/**
 * Default expiration time for pending confirmations: 5 minutes.
 */
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Create a new pending confirmation request for a tool call
 * that requires human approval.
 */
export function createPendingConfirmation(params: {
  threadId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskLevel: ToolRiskLevel;
  description?: string;
}): PendingConfirmation {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const confirmation: PendingConfirmation = {
    id,
    threadId: params.threadId,
    toolName: params.toolName,
    toolArgs: params.toolArgs,
    riskLevel: params.riskLevel,
    description:
      params.description ||
      `${params.riskLevel} operation: ${params.toolName} requires your confirmation.`,
    status: ConfirmationStatus.PENDING,
    createdAt: now,
  };

  pendingStore.set(id, confirmation);

  if (isDatabaseConnected()) {
    prisma.thread
      .upsert({
        where: { id: params.threadId },
        create: { id: params.threadId, title: "HITL Session" },
        update: {},
      })
      .then(() =>
        prisma.pendingConfirmation.create({
          data: {
            id,
            threadId: params.threadId,
            toolName: params.toolName,
            toolArgs: params.toolArgs as any,
            riskLevel: params.riskLevel,
            status: ConfirmationStatus.PENDING,
            description: confirmation.description,
          },
        })
      )
      .catch(() => {});
  }

  console.log(
    `[PermissionManager] Created pending confirmation ${id} for tool "${params.toolName}" (${params.riskLevel}) on thread "${params.threadId}"`
  );

  return confirmation;
}

/**
 * Retrieve a pending confirmation by its ID.
 */
export function getPendingConfirmation(
  confirmationId: string
): PendingConfirmation | undefined {
  return pendingStore.get(confirmationId);
}

/**
 * Resolve a pending confirmation with the user's decision.
 * Returns the updated confirmation, or undefined if not found.
 */
export function resolvePendingConfirmation(
  confirmationId: string,
  approved: boolean
): PendingConfirmation | undefined {
  const confirmation = pendingStore.get(confirmationId);
  if (!confirmation) return undefined;

  if (confirmation.status !== ConfirmationStatus.PENDING) {
    console.warn(
      `[PermissionManager] Confirmation ${confirmationId} already resolved as ${confirmation.status}`
    );
    return confirmation;
  }

  confirmation.status = approved
    ? ConfirmationStatus.APPROVED
    : ConfirmationStatus.REJECTED;
  confirmation.resolvedAt = new Date().toISOString();

  pendingStore.set(confirmationId, confirmation);

  if (isDatabaseConnected()) {
    prisma.pendingConfirmation
      .updateMany({
        where: { id: confirmationId },
        data: {
          status: confirmation.status,
          resolvedAt: new Date(confirmation.resolvedAt),
        },
      })
      .catch(() => {});
  }

  console.log(
    `[PermissionManager] Confirmation ${confirmationId} resolved: ${confirmation.status}`
  );

  return confirmation;
}

/**
 * List all pending confirmations, optionally filtered by thread ID.
 */
export function listPendingConfirmations(
  threadId?: string
): PendingConfirmation[] {
  const all = Array.from(pendingStore.values());

  const filtered = threadId
    ? all.filter((c) => c.threadId === threadId)
    : all;

  return filtered.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Remove expired pending confirmations that have been waiting
 * longer than maxAgeMs. Expired confirmations are marked as EXPIRED.
 * Returns the number of confirmations expired.
 */
export function cleanupExpiredConfirmations(
  maxAgeMs: number = DEFAULT_EXPIRY_MS
): number {
  const now = Date.now();
  let expiredCount = 0;

  for (const [id, confirmation] of pendingStore.entries()) {
    if (confirmation.status !== ConfirmationStatus.PENDING) continue;

    const age = now - new Date(confirmation.createdAt).getTime();
    if (age > maxAgeMs) {
      confirmation.status = ConfirmationStatus.EXPIRED;
      confirmation.resolvedAt = new Date().toISOString();
      pendingStore.set(id, confirmation);
      expiredCount++;

      console.log(
        `[PermissionManager] Confirmation ${id} expired after ${Math.round(age / 1000)}s`
      );
    }
  }

  return expiredCount;
}

/**
 * Clear all confirmations (useful for testing).
 */
export function clearAllConfirmations(): void {
  pendingStore.clear();
}

/**
 * Get the count of currently pending confirmations.
 */
export function getPendingCount(threadId?: string): number {
  let count = 0;
  for (const c of pendingStore.values()) {
    if (c.status !== ConfirmationStatus.PENDING) continue;
    if (threadId && c.threadId !== threadId) continue;
    count++;
  }
  return count;
}
