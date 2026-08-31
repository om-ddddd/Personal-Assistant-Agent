"use client";

import React from "react";
import {
  PanelLeft,
  FolderGit2,
  Trash2,
  Shield,
  Zap,
  User,
  LogOut,
  Key,
} from "lucide-react";
import { ModelSelector, ModelOption } from "@/components/assistant-ui/model-selector";
import { UserProfile } from "@/lib/user-auth";
import { cn } from "@/lib/utils";

interface HeaderProps {
  sessionTitle: string;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  selectedModelId: string;
  onModelSelect: (model: ModelOption) => void;
  onClearThread?: () => void;
  isBackendHealthy?: boolean | null;
  onOpenPermissionManager?: () => void;
  pendingConfirmationsCount?: number;
  onOpenIntegrations?: () => void;
  onOpenJobsDrawer?: () => void;
  activeJobsCount?: number;
  currentUser?: UserProfile | null;
  onOpenAuth?: () => void;
  onLogout?: () => void;
  onOpenLlmProfile?: () => void;
}

export function Header({
  sessionTitle,
  isSidebarOpen,
  onToggleSidebar,
  selectedModelId,
  onModelSelect,
  onClearThread,
  isBackendHealthy,
  onOpenPermissionManager,
  pendingConfirmationsCount = 0,
  onOpenIntegrations,
  onOpenJobsDrawer,
  activeJobsCount = 0,
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenLlmProfile,
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

      {/* Right side: Model Selector, Tasks, Permission Gate button, and actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Background Tasks Manager Button */}
        {onOpenJobsDrawer && (
          <button
            type="button"
            onClick={onOpenJobsDrawer}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-all hover:bg-zinc-900",
              activeJobsCount > 0
                ? "bg-emerald-950/40 border-emerald-700/80 text-emerald-300 animate-pulse shadow-sm shadow-emerald-950/50"
                : "bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-700"
            )}
            title="Open Background Task Manager (Redis 8 + BullMQ)"
          >
            <Zap className={cn("w-3.5 h-3.5", activeJobsCount > 0 ? "text-emerald-400" : "text-zinc-400")} />
            <span className="hidden sm:inline text-[11px]">Tasks</span>
            {activeJobsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-400 text-zinc-950">
                {activeJobsCount}
              </span>
            )}
          </button>
        )}

        {/* Setup & Integrations Button */}
        {onOpenIntegrations && (
          <button
            type="button"
            onClick={onOpenIntegrations}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-all bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
            title="Setup & Integrations: GitHub, Google Workspace, and Project Workspace Directory"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline text-[11px]">Setup & Integrations</span>
          </button>
        )}

        {/* Permission Gate Manager Button */}
        {onOpenPermissionManager && (
          <button
            type="button"
            onClick={onOpenPermissionManager}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-all hover:bg-zinc-900",
              pendingConfirmationsCount > 0
                ? "bg-amber-950/40 border-amber-700/80 text-amber-300 animate-pulse shadow-sm shadow-amber-950/50"
                : "bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-700"
            )}
            title="Open Tool Permission Manager and Security Guardrails"
          >
            <Shield className={cn("w-3.5 h-3.5", pendingConfirmationsCount > 0 ? "text-amber-400" : "text-indigo-400")} />
            <span className="hidden sm:inline text-[11px]">Permissions</span>
            {pendingConfirmationsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-zinc-950">
                {pendingConfirmationsCount}
              </span>
            )}
          </button>
        )}

        {/* LLM Profile & Provider Keys Button */}
        {onOpenLlmProfile && (
          <button
            type="button"
            onClick={onOpenLlmProfile}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-all bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-indigo-400"
            title="Configure LLM API Keys and Local Inference Endpoints"
          >
            <Key className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline text-[11px]">API Keys</span>
          </button>
        )}

        {/* Model Selector */}
        <ModelSelector
          selectedModelId={selectedModelId}
          onModelSelect={onModelSelect}
          onOpenKeySettings={onOpenLlmProfile}
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

        {/* User Account / Login Button */}
        {currentUser ? (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-zinc-800">
            <div
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
              title={`Logged in as ${currentUser.email}`}
            >
              <div className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-semibold text-[10px] flex items-center justify-center">
                {(currentUser.name || currentUser.email || "U").slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden lg:inline text-[11px] font-medium max-w-[100px] truncate">
                {currentUser.name || currentUser.email.split("@")[0]}
              </span>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 border border-zinc-800 transition-colors"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-sm shadow-blue-600/20"
              title="Sign in to your account"
            >
              <User className="w-3.5 h-3.5" />
              <span className="text-[11px]">Sign In</span>
            </button>
          )
        )}
      </div>
    </header>
  );
}
