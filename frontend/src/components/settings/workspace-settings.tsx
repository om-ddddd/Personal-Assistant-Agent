"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FolderOpen,
  Save,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchWorkspaceSettings,
  updateWorkspaceSettings,
  WorkspaceSettings,
} from "@/lib/agent-runtime";

type FeedbackState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

export function WorkspaceSettingsPanel() {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [inputPath, setInputPath] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchWorkspaceSettings();
    setSettings(data);
    setInputPath(data?.workspacePath ?? "");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const clearFeedback = () => setFeedback(null);

  const handleSave = async () => {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      setFeedback({ type: "error", message: "Please enter a valid directory path." });
      return;
    }
    if (trimmed === settings?.workspacePath) {
      setFeedback({ type: "success", message: "No changes to save." });
      return;
    }

    setIsSaving(true);
    clearFeedback();

    const result = await updateWorkspaceSettings({ workspacePath: trimmed });

    if (result.success) {
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              workspacePath: result.workspacePath ?? trimmed,
              effectivePath: result.effectivePath ?? trimmed,
              isDefault: result.isDefault ?? false,
            }
          : null
      );
      setInputPath(result.workspacePath ?? trimmed);
      setFeedback({ type: "success", message: "Workspace path updated. The agent will use this directory on the next request." });
    } else {
      setFeedback({ type: "error", message: result.error || "Failed to update workspace path." });
    }

    setIsSaving(false);
  };

  const handleReset = async () => {
    setIsResetting(true);
    clearFeedback();

    const result = await updateWorkspaceSettings({ reset: true });

    if (result.success) {
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              workspacePath: null,
              effectivePath: result.effectivePath ?? prev.defaultPath,
              isDefault: true,
            }
          : null
      );
      setInputPath("");
      setFeedback({ type: "success", message: "Workspace reset to system default." });
    } else {
      setFeedback({ type: "error", message: result.error || "Failed to reset workspace path." });
    }

    setIsResetting(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 space-y-2">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-xs font-mono">Loading workspace settings...</span>
      </div>
    );
  }

  const effectivePath = settings?.effectivePath ?? settings?.defaultPath ?? "";
  const isDirty = inputPath.trim() !== (settings?.workspacePath ?? "");

  return (
    <div className="space-y-5 p-1">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/50">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-indigo-300 leading-relaxed">
          The workspace directory is the root folder the AI agent can read and write files within
          using the Filesystem tools. Set it to your project directory so the agent has access to
          the right files.
        </p>
      </div>

      {/* Current effective path */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
        <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <HardDrive className="w-3 h-3" />
          Current Effective Path
        </div>
        <p className="text-xs font-mono text-zinc-200 break-all">
          {effectivePath || "Not set"}
        </p>
        {settings?.isDefault && (
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 border border-zinc-700 text-zinc-400">
            System Default
          </span>
        )}
        {!settings?.isDefault && (
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950/70 border border-indigo-800/60 text-indigo-400">
            Custom Path
          </span>
        )}
      </div>

      {/* Path input */}
      <div className="space-y-2">
        <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <FolderOpen className="w-3 h-3" />
          Custom Workspace Path
        </label>
        <div className="relative">
          <input
            type="text"
            value={inputPath}
            onChange={(e) => {
              setInputPath(e.target.value);
              clearFeedback();
            }}
            placeholder={settings?.defaultPath ?? "Enter absolute directory path..."}
            spellCheck={false}
            className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500/80 transition-colors"
          />
        </div>
        <p className="text-[10px] text-zinc-500">
          Enter an absolute path (e.g.{" "}
          <span className="font-mono text-zinc-400">C:\Users\name\projects\myapp</span> on Windows
          or <span className="font-mono text-zinc-400">/home/name/projects/myapp</span> on
          Linux/macOS). The path must exist on the server.
        </p>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={cn(
            "flex items-start gap-2.5 p-3 rounded-xl border text-xs",
            feedback.type === "success"
              ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
              : "bg-rose-950/30 border-rose-800/60 text-rose-300"
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={handleReset}
          disabled={isResetting || isSaving || (settings?.isDefault ?? true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isResetting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          Reset to Default
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isResetting || !isDirty}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors disabled:cursor-not-allowed shadow-md"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save Workspace
        </button>
      </div>
    </div>
  );
}
