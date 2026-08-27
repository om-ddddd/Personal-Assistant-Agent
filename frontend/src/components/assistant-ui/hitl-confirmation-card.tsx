"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Play,
  X,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Calendar,
  Mail,
  FileCode,
  GitBranch,
  Terminal,
  Wrench,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolRiskLevel, confirmToolExecution } from "@/lib/agent-runtime";

interface HITLConfirmationCardProps {
  toolName: string;
  parameters: string;
  riskLevel: ToolRiskLevel;
  threadId: string;
  initialStatus?: "pending" | "approved" | "rejected";
  onDecision?: (approved: boolean, responseContent?: string) => void;
  className?: string;
}

export function HITLConfirmationCard({
  toolName,
  parameters,
  riskLevel = "WRITE",
  threadId,
  initialStatus = "pending",
  onDecision,
  className,
}: HITLConfirmationCardProps) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">(initialStatus);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDestructive = riskLevel === "DESTRUCTIVE";

  // Parse formatted parameters
  let formattedParams = parameters;
  try {
    const parsed = JSON.parse(parameters);
    formattedParams = JSON.stringify(parsed, null, 2);
  } catch {
    // Keep raw
  }

  const getToolIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("calendar")) return <Calendar className="w-4 h-4 text-indigo-400" />;
    if (n.includes("mail") || n.includes("email")) return <Mail className="w-4 h-4 text-amber-400" />;
    if (n.includes("file") || n.includes("write") || n.includes("edit")) return <FileCode className="w-4 h-4 text-cyan-400" />;
    if (n.includes("branch") || n.includes("pr") || n.includes("issue") || n.includes("repo")) return <GitBranch className="w-4 h-4 text-purple-400" />;
    return <Wrench className="w-4 h-4 text-zinc-400" />;
  };

  const handleAction = async (approved: boolean) => {
    if (isProcessing || status !== "pending") return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const res = await confirmToolExecution(threadId, approved);
      if (res.error) {
        setErrorMessage(res.error);
        setIsProcessing(false);
        return;
      }

      setStatus(approved ? "approved" : "rejected");
      if (res.content) {
        setResultSummary(res.content);
      }
      onDecision?.(approved, res.content);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(error.message || "Failed to submit decision");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className={cn(
        "my-3 rounded-xl border overflow-hidden transition-all duration-200 shadow-xl",
        status === "pending"
          ? isDestructive
            ? "border-rose-700/70 bg-rose-950/20 shadow-rose-950/40"
            : "border-amber-600/70 bg-amber-950/20 shadow-amber-950/40"
          : status === "approved"
          ? "border-emerald-700/60 bg-emerald-950/20 shadow-emerald-950/30"
          : "border-zinc-800 bg-zinc-900/60",
        className
      )}
    >
      {/* Header Banner */}
      <div
        className={cn(
          "px-4 py-3 flex items-center justify-between gap-3 border-b backdrop-blur-md select-none",
          status === "pending"
            ? isDestructive
              ? "bg-rose-950/70 border-rose-800/60 text-rose-200"
              : "bg-amber-950/70 border-amber-800/60 text-amber-200"
            : status === "approved"
            ? "bg-emerald-950/70 border-emerald-800/60 text-emerald-200"
            : "bg-zinc-900/90 border-zinc-800 text-zinc-300"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "w-7 h-7 rounded-lg border flex items-center justify-center shrink-0",
              status === "pending"
                ? isDestructive
                  ? "bg-rose-900/80 border-rose-700 text-rose-300 animate-pulse"
                  : "bg-amber-900/80 border-amber-700 text-amber-300"
                : status === "approved"
                ? "bg-emerald-900/80 border-emerald-700 text-emerald-300"
                : "bg-zinc-800 border-zinc-700 text-zinc-400"
            )}
          >
            {isDestructive ? (
              <AlertTriangle className="w-4 h-4 text-rose-300" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-300" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-zinc-100 tracking-tight truncate">
                Permission Gate: {isDestructive ? "Destructive Action" : "Write Operation"}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border",
                  isDestructive
                    ? "bg-rose-950 border-rose-700 text-rose-400 animate-pulse"
                    : "bg-amber-950 border-amber-700 text-amber-400"
                )}
              >
                {riskLevel}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono truncate">
              Tool target: <span className="text-zinc-200 font-semibold">{toolName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status === "pending" ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-amber-900/50 border border-amber-700/60 text-amber-300 animate-pulse">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              Confirmation Required
            </span>
          ) : status === "approved" ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-emerald-900/50 border border-emerald-700/60 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approved by User
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-zinc-800 border border-zinc-700 text-zinc-400">
              <XCircle className="w-3.5 h-3.5" />
              Denied by User
            </span>
          )}
        </div>
      </div>

      {/* Warning Notice for Destructive operations */}
      {isDestructive && status === "pending" && (
        <div className="px-4 py-2 bg-rose-950/40 border-b border-rose-900/50 flex items-center gap-2 text-rose-300 text-xs font-sans">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          <span>
            Caution: This operation will irreversibly modify or delete external data.
          </span>
        </div>
      )}

      {/* Content Body: Collapsible Parameters Drawer */}
      <div className="p-4 space-y-3 bg-zinc-950/70 text-xs">
        <div className="flex items-center justify-between text-zinc-400">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors font-mono text-[11px] uppercase tracking-wider select-none"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span>Execution Parameters</span>
          </button>
          <span className="text-[10px] font-mono text-zinc-500">
            Thread ID: {threadId.slice(0, 8)}...
          </span>
        </div>

        {isExpanded && (
          <pre className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-indigo-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all shadow-inner leading-relaxed">
            {formattedParams}
          </pre>
        )}

        {/* Error notice if resolution failed */}
        {errorMessage && (
          <div className="p-2.5 rounded-md bg-rose-950/60 border border-rose-800/80 text-rose-300 font-mono text-xs flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Error: {errorMessage}</span>
          </div>
        )}

        {/* Summary output after approval */}
        {resultSummary && (
          <div className="space-y-1 pt-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
              Execution Result
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-xs font-sans whitespace-pre-wrap">
              {resultSummary}
            </div>
          </div>
        )}

        {/* Interactive Approve / Deny Actions */}
        {status === "pending" && (
          <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-400 leading-snug">
              Review parameters above. The agent is paused waiting for your human approval.
            </p>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleAction(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 text-xs font-medium border border-zinc-700/80 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-3.5 h-3.5" />
                <span>Deny Request</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleAction(true)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed",
                  isDestructive
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/60"
                    : "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-950/60"
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Approve & Execute</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
