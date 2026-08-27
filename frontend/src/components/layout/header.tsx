"use client";

import React from "react";
import {
  PanelLeft,
  FolderGit2,
  Trash2,
  Server,
} from "lucide-react";
import { ModelSelector, ModelOption } from "@/components/assistant-ui/model-selector";
import { cn } from "@/lib/utils";

interface HeaderProps {
  sessionTitle: string;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  selectedModelId: string;
  onModelSelect: (model: ModelOption) => void;
  onClearThread?: () => void;
  isBackendHealthy?: boolean | null;
}

export function Header({
  sessionTitle,
  isSidebarOpen,
  onToggleSidebar,
  selectedModelId,
  onModelSelect,
  onClearThread,
  isBackendHealthy,
}: HeaderProps) {
  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between gap-4 select-none shrink-0 z-20">
      {/* Left side: Sidebar toggle and session title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
          title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-zinc-100 truncate">
            {sessionTitle}
          </span>
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400">
            <FolderGit2 className="w-3 h-3 text-indigo-400" />
            <span>workspace: active</span>
          </div>
        </div>
      </div>

      {/* Right side: Model Selector and actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Model Selector */}
        <ModelSelector
          selectedModelId={selectedModelId}
          onModelSelect={onModelSelect}
        />

        {/* Dynamic Backend Status indicator */}
        <div
          className={cn(
            "hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors",
            isBackendHealthy === true
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-400"
              : isBackendHealthy === false
              ? "bg-rose-950/40 border-rose-800/60 text-rose-400"
              : "bg-zinc-900/90 border-zinc-800 text-zinc-400"
          )}
          title={
            isBackendHealthy === true
              ? "Connected to Express + LangGraph backend (Port 5000)"
              : isBackendHealthy === false
              ? "Backend is offline. Ensure 'cd backend && npm run dev' is running"
              : "Checking backend connectivity..."
          }
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isBackendHealthy === true
                ? "bg-emerald-400 animate-pulse"
                : isBackendHealthy === false
                ? "bg-rose-400"
                : "bg-amber-400 animate-ping"
            )}
          />
          <span className="text-[11px]">
            {isBackendHealthy === true
              ? "LangGraph Live"
              : isBackendHealthy === false
              ? "Backend Offline"
              : "Connecting..."}
          </span>
        </div>

        {/* Clear thread action */}
        {onClearThread && (
          <button
            type="button"
            onClick={onClearThread}
            className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 border border-zinc-800 transition-colors"
            title="Clear current thread"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
