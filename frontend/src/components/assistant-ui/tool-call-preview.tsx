"use client";

import React, { useState } from "react";
import {
  Terminal,
  FileCode,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Play,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PermissionLevel = "READ" | "WRITE" | "DESTRUCTIVE";

export interface ToolCallData {
  id: string;
  name: string;
  category?: "system" | "github" | "filesystem" | "terminal" | "mcp";
  permissionLevel: PermissionLevel;
  arguments: Record<string, unknown>;
  output?: string;
  status: "pending_approval" | "executing" | "completed" | "rejected" | "error";
  error?: string;
}

interface ToolCallPreviewProps {
  toolCall: ToolCallData;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  className?: string;
}

export function ToolCallPreview({
  toolCall,
  onApprove,
  onReject,
  className,
}: ToolCallPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const getPermissionBadge = (level: PermissionLevel) => {
    switch (level) {
      case "READ":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
            <ShieldCheck className="w-3 h-3" />
            READ
          </span>
        );
      case "WRITE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950/70 text-amber-400 border border-amber-800/60">
            <ShieldAlert className="w-3 h-3" />
            WRITE
          </span>
        );
      case "DESTRUCTIVE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950/70 text-rose-400 border border-rose-800/60 animate-pulse">
            <ShieldAlert className="w-3 h-3" />
            DESTRUCTIVE
          </span>
        );
    }
  };

  const getToolIcon = (name: string) => {
    if (name.includes("github") || name.includes("pr") || name.includes("issue")) {
      return <GitPullRequest className="w-4 h-4 text-purple-400" />;
    }
    if (name.includes("file") || name.includes("read") || name.includes("write")) {
      return <FileCode className="w-4 h-4 text-cyan-400" />;
    }
    return <Terminal className="w-4 h-4 text-emerald-400" />;
  };

  const getStatusDisplay = () => {
    switch (toolCall.status) {
      case "pending_approval":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            Awaiting Confirmation
          </span>
        );
      case "executing":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            Executing
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
    }
  };

  return (
    <div
      className={cn(
        "my-3 rounded-lg border bg-zinc-950/80 overflow-hidden transition-all duration-150",
        toolCall.status === "pending_approval"
          ? "border-amber-700/50 shadow-lg shadow-amber-950/20"
          : "border-zinc-800",
        className
      )}
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-zinc-900/90 flex items-center justify-between gap-3 border-b border-zinc-800/80">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-left min-w-0 flex-1 hover:opacity-80 transition-opacity"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          <div className="p-1 rounded bg-zinc-800 text-zinc-200 shrink-0">
            {getToolIcon(toolCall.name)}
          </div>
          <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
            {toolCall.name}
          </span>
          {getPermissionBadge(toolCall.permissionLevel)}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {getStatusDisplay()}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3.5 space-y-3 bg-zinc-950/60">
          {/* Arguments */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
              Parameters
            </p>
            <pre className="text-xs text-zinc-300 bg-zinc-900/90 border border-zinc-800/80 rounded p-2.5 overflow-x-auto font-mono">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>

          {/* Output / Result */}
          {toolCall.output && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                Result
              </p>
              <pre className="text-xs text-emerald-400/90 bg-zinc-900/90 border border-zinc-800/80 rounded p-2.5 overflow-x-auto font-mono">
                {toolCall.output}
              </pre>
            </div>
          )}

          {/* Error */}
          {toolCall.error && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-1">
                Error Message
              </p>
              <pre className="text-xs text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded p-2.5 overflow-x-auto font-mono">
                {toolCall.error}
              </pre>
            </div>
          )}

          {/* Action confirmation dialog for pending approval */}
          {toolCall.status === "pending_approval" && (
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3">
              <div className="text-[11px] text-amber-300/90 font-mono">
                Confirmation required before executing {toolCall.permissionLevel} action.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onReject?.(toolCall.id)}
                  className="px-3 py-1.5 rounded text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => onApprove?.(toolCall.id)}
                  className="px-3 py-1.5 rounded text-xs font-medium text-zinc-950 bg-amber-400 hover:bg-amber-300 transition-colors flex items-center gap-1.5 font-semibold"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Approve Execution
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
