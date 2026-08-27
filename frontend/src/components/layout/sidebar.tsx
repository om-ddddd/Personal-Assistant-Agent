"use client";

import React from "react";
import {
  Plus,
  MessageSquare,
  Terminal,
  Shield,
  Trash2,
  Cpu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThreadSession } from "@/lib/agent-runtime";

interface SidebarProps {
  sessions: ThreadSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isNewSessionDisabled?: boolean;
  onOpenPermissionManager?: () => void;
  pendingConfirmationsCount?: number;
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 30) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "Recently";
  }
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  isOpen,
  onToggleOpen,
  isNewSessionDisabled,
  onOpenPermissionManager,
  pendingConfirmationsCount = 0,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "h-full bg-zinc-950/95 border-r border-zinc-800/80 flex flex-col transition-all duration-300 z-30 shrink-0 select-none",
        isOpen ? "w-64" : "w-14"
      )}
    >
      {/* Top Header & Branding */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-zinc-800/80">
        {isOpen ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-mono font-bold text-xs shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-xs text-zinc-100 tracking-tight truncate">
                Dev Assistant
              </h1>
              <p className="text-[10px] text-zinc-500 font-mono truncate">
                LangGraph + MCP
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-7 h-7 rounded-md bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-mono font-bold text-xs">
              <Terminal className="w-4 h-4" />
            </div>
          </div>
        )}

        {isOpen && (
          <button
            type="button"
            onClick={onToggleOpen}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New Chat Action */}
      <div className="p-2">
        <button
          type="button"
          onClick={onNewSession}
          disabled={isNewSessionDisabled}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all",
            isNewSessionDisabled
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-70"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-950",
            !isOpen && "p-2"
          )}
          title={isNewSessionDisabled ? "You are already in a new conversation" : "Start New Session"}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {isOpen && <span>New Session</span>}
        </button>
      </div>

      {/* Session History List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {isOpen && (
          <div className="px-2 py-1 text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
            Conversations ({sessions.length})
          </div>
        )}

        {sessions.length === 0 && isOpen && (
          <div className="px-3 py-8 text-center text-xs text-zinc-500 space-y-1">
            <p>No active sessions.</p>
            <p className="text-[11px] text-zinc-600">Click &apos;New Session&apos; above.</p>
          </div>
        )}

        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                "group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors text-xs",
                isActive
                  ? "bg-zinc-900 text-zinc-100 font-medium border border-zinc-800"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
              )}
              title={session.title}
            >
              <MessageSquare
                className={cn(
                  "w-3.5 h-3.5 shrink-0",
                  isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-400"
                )}
              />

              {isOpen && (
                <>
                  <div className="flex-1 truncate min-w-0">
                    <p className="truncate text-xs">{session.title}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">
                      {formatRelativeTime(session.updatedAt)}
                      {session.messageCount > 0 && ` (${session.messageCount})`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-all"
                    title="Delete Session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* System Status and Security Gate Footer */}
      <div className="p-2 border-t border-zinc-800/80 space-y-2 bg-zinc-950">
        {isOpen ? (
          <div className="space-y-1.5">
            {/* Status Item 1: Runtime */}
            <div className="p-2 rounded bg-zinc-900/70 border border-zinc-800/60 text-[11px] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-zinc-300">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Runtime Engine</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-900/60">
                LangGraph
              </span>
            </div>

            {/* Status Item 2: Security Gate (Clickable) */}
            <button
              type="button"
              onClick={onOpenPermissionManager}
              className={cn(
                "w-full p-2 rounded border text-[11px] flex items-center justify-between transition-all text-left",
                pendingConfirmationsCount > 0
                  ? "bg-amber-950/40 border-amber-700/80 text-amber-200 animate-pulse hover:bg-amber-950/60"
                  : "bg-zinc-900/70 hover:bg-zinc-800 border-zinc-800/60 text-zinc-300"
              )}
              title="Open Permission Manager & HITL Approvals"
            >
              <div className="flex items-center gap-1.5">
                <Shield className={cn("w-3.5 h-3.5", pendingConfirmationsCount > 0 ? "text-amber-400" : "text-indigo-400")} />
                <span>Permission Gate</span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded border",
                  pendingConfirmationsCount > 0
                    ? "bg-amber-950 text-amber-300 border-amber-700 font-bold"
                    : "text-indigo-300 bg-indigo-950/60 border-indigo-900/60"
                )}
              >
                {pendingConfirmationsCount > 0 ? `${pendingConfirmationsCount} Pending` : "Enforced"}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              type="button"
              onClick={onOpenPermissionManager}
              className={cn(
                "p-2 rounded border text-zinc-400 hover:text-zinc-200 transition-colors relative",
                pendingConfirmationsCount > 0
                  ? "bg-amber-950/40 border-amber-700/80 text-amber-300 animate-pulse"
                  : "hover:bg-zinc-900 border-transparent"
              )}
              title="Permission Gate"
            >
              <Shield className="w-4 h-4" />
              {pendingConfirmationsCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleOpen}
              className="p-2 rounded hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Expand Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
