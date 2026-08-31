"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Github,
  Calendar,
  Mail,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Zap,
  HardDrive,
  Save,
  Loader2,
  ArrowRight,
  Sparkles,
  Lock,
  X,
  RotateCcw,
} from "lucide-react";
import {
  fetchGitHubStatus,
  fetchGitHubOAuthUrl,
  disconnectGitHub,
  fetchGoogleStatus,
  fetchGoogleOAuthUrl,
  disconnectGoogle,
  GitHubAuthStatus,
  GoogleAuthStatus,
} from "@/lib/auth-api";
import {
  fetchWorkspaceSettings,
  updateWorkspaceSettings,
  WorkspaceSettings,
} from "@/lib/agent-runtime";
import { cn } from "@/lib/utils";

interface SetupGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete?: () => void;
  forceGate?: boolean; // When true, modal cannot be dismissed until all 3 steps are complete
}

export function SetupGateModal({
  isOpen,
  onClose,
  onSetupComplete,
  forceGate = false,
}: SetupGateModalProps) {
  const [githubStatus, setGithubStatus] = useState<GitHubAuthStatus>({
    connected: false,
    authMethod: "none",
  });
  const [googleStatus, setGoogleStatus] = useState<GoogleAuthStatus>({
    configured: false,
    mode: "sandbox",
    hasClientId: false,
    hasClientSecret: false,
  });
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [workspaceFeedback, setWorkspaceFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [isResettingWorkspace, setIsResettingWorkspace] = useState(false);

  const loadAllStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const [gh, ggl, ws] = await Promise.all([
        fetchGitHubStatus(),
        fetchGoogleStatus(),
        fetchWorkspaceSettings(),
      ]);
      setGithubStatus(gh);
      setGoogleStatus(ggl);
      setWorkspaceSettings(ws);
      if (ws?.workspacePath) {
        setWorkspaceInput(ws.workspacePath);
      }
    } catch (err) {
      console.error("Failed to load setup statuses:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadAllStatuses();
    }
  }, [isOpen, loadAllStatuses]);

  // Derived completion checks for the 3 steps
  const isGitHubComplete = githubStatus.connected;
  const isGoogleComplete = googleStatus.configured && googleStatus.mode === "live";
  const isWorkspaceComplete =
    workspaceSettings !== null &&
    workspaceSettings.workspacePath !== null &&
    workspaceSettings.workspacePath.trim().length > 0;

  const completedCount =
    (isGitHubComplete ? 1 : 0) +
    (isGoogleComplete ? 1 : 0) +
    (isWorkspaceComplete ? 1 : 0);

  const isAllComplete = isGitHubComplete && isGoogleComplete && isWorkspaceComplete;

  const handleConnectGitHub = async () => {
    setActionLoading("github_connect");
    try {
      const res = await fetchGitHubOAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      } else {
        alert("GitHub OAuth credentials not configured in backend/.env.");
      }
    } catch {
      alert("Failed to initiate GitHub OAuth.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!confirm("Are you sure you want to disconnect GitHub? You will need to reconnect it to continue using the assistant.")) {
      return;
    }
    setActionLoading("github_disconnect");
    await disconnectGitHub();
    await loadAllStatuses();
    setActionLoading(null);
  };

  const handleConnectGoogle = async () => {
    setActionLoading("google_connect");
    try {
      const res = await fetchGoogleOAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      } else {
        alert("Google OAuth credentials not configured in backend/.env.");
      }
    } catch {
      alert("Failed to initiate Google OAuth.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm("Are you sure you want to disconnect Google Workspace? You will need to reconnect it to continue using the assistant.")) {
      return;
    }
    setActionLoading("google_disconnect");
    await disconnectGoogle();
    await loadAllStatuses();
    setActionLoading(null);
  };

  const handleSaveWorkspace = async () => {
    let clean = workspaceInput.trim().replace(/^["']+|["']+$/g, "").trim();
    if (clean.startsWith(":\\") || clean.startsWith(":/")) {
      clean = "C" + clean;
    }
    if (!clean) {
      setWorkspaceFeedback({
        type: "error",
        message: "Please enter a valid directory path.",
      });
      return;
    }

    setIsSavingWorkspace(true);
    setWorkspaceFeedback(null);

    try {
      const result = await updateWorkspaceSettings({ workspacePath: clean });
      if (result.success) {
        setWorkspaceSettings((prev) =>
          prev
            ? {
                ...prev,
                workspacePath: result.workspacePath ?? clean,
                effectivePath: result.effectivePath ?? clean,
                isDefault: false,
              }
            : null
        );
        setWorkspaceFeedback({
          type: "success",
          message: "Workspace path verified and saved successfully.",
        });
        await loadAllStatuses();
      } else {
        setWorkspaceFeedback({
          type: "error",
          message: result.error || "Directory does not exist or is invalid.",
        });
      }
    } catch {
      setWorkspaceFeedback({
        type: "error",
        message: "Failed to connect to backend server.",
      });
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  const handleResetWorkspace = async () => {
    setIsResettingWorkspace(true);
    setWorkspaceFeedback(null);
    try {
      const result = await updateWorkspaceSettings({ reset: true });
      if (result.success) {
        setWorkspaceSettings((prev) =>
          prev
            ? {
                ...prev,
                workspacePath: null,
                effectivePath: result.effectivePath ?? prev.defaultPath,
                isDefault: true,
              }
            : null
        );
        setWorkspaceInput("");
        setWorkspaceFeedback({
          type: "success",
          message: "Workspace directory has been reset. Please set a custom project directory.",
        });
        await loadAllStatuses();
      }
    } catch {
      setWorkspaceFeedback({
        type: "error",
        message: "Failed to reset workspace path.",
      });
    } finally {
      setIsResettingWorkspace(false);
    }
  };

  const handleFinalUnlock = () => {
    if (!isAllComplete) return;
    onSetupComplete?.();
    onClose();
  };

  if (!isOpen) return null;

  // If forceGate is active and setup is incomplete, dismiss is blocked
  const canClose = !forceGate || isAllComplete;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] text-zinc-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border transition-colors",
                isAllComplete
                  ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400"
                  : "bg-indigo-600/20 border-indigo-500/40 text-indigo-400"
              )}
            >
              {isAllComplete ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100 tracking-tight">
                  Required Assistant Setup
                </h2>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border",
                    isAllComplete
                      ? "bg-emerald-950/80 border-emerald-800 text-emerald-400"
                      : "bg-amber-950/80 border-amber-800 text-amber-400"
                  )}
                >
                  {isAllComplete
                    ? "3/3 Completed - Ready"
                    : `${completedCount}/3 Completed - Required`}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Complete all 3 prerequisites below to activate and unlock your Developer Assistant.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAllStatuses}
              disabled={loading}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>

            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Tracker Bar */}
        <div className="bg-zinc-900/40 border-b border-zinc-800/60 px-6 py-3">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5 text-zinc-400">
            <span>Setup Checklist</span>
            <span className={isAllComplete ? "text-emerald-400 font-bold" : "text-amber-400"}>
              {completedCount} of 3 Steps Verified
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
            <div
              className={cn(
                "h-full transition-all duration-500 rounded-full",
                isAllComplete
                  ? "bg-emerald-500"
                  : completedCount > 0
                  ? "bg-indigo-500"
                  : "bg-zinc-700"
              )}
              style={{ width: `${(completedCount / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* STEP 1: GitHub Authentication */}
          <div
            className={cn(
              "p-4 rounded-xl border transition-all space-y-3",
              isGitHubComplete
                ? "bg-emerald-950/10 border-emerald-800/40"
                : "bg-zinc-900/60 border-zinc-800"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0 mt-0.5">
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-zinc-500 uppercase">
                      Step 1
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      GitHub Authentication
                    </h3>
                    {isGitHubComplete ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-950/80 text-rose-300 border border-rose-800">
                        <AlertCircle className="w-3 h-3" />
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Connect your GitHub account so the agent can list repositories, search codebase, inspect commits, and manage pull requests.
                  </p>
                </div>
              </div>

              <div>
                {isGitHubComplete ? (
                  <button
                    type="button"
                    onClick={handleDisconnectGitHub}
                    disabled={actionLoading === "github_disconnect"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 text-xs font-medium text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGitHub}
                    disabled={actionLoading === "github_connect"}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md transition-all"
                  >
                    {actionLoading === "github_connect" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    <span>Connect GitHub</span>
                  </button>
                )}
              </div>
            </div>

            {isGitHubComplete && (
              <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
                {githubStatus.user ? (
                  <div className="flex items-center gap-2">
                    {githubStatus.user.avatar_url && (
                      <img
                        src={githubStatus.user.avatar_url}
                        alt="Avatar"
                        className="w-5 h-5 rounded-full border border-zinc-700"
                      />
                    )}
                    <span className="text-zinc-200">@{githubStatus.user.login}</span>
                    {githubStatus.user.name && (
                      <span className="text-zinc-500">({githubStatus.user.name})</span>
                    )}
                  </div>
                ) : (
                  <span>Authenticated via OAuth / PAT</span>
                )}
                <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>GitHub Tools Activated</span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Google Workspace Authentication */}
          <div
            className={cn(
              "p-4 rounded-xl border transition-all space-y-3",
              isGoogleComplete
                ? "bg-emerald-950/10 border-emerald-800/40"
                : "bg-zinc-900/60 border-zinc-800"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0 mt-0.5">
                  <div className="flex gap-0.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <Mail className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-zinc-500 uppercase">
                      Step 2
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Google Workspace (Calendar & Gmail)
                    </h3>
                    {isGoogleComplete ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Connected (Live)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-950/80 text-rose-300 border border-rose-800">
                        <AlertCircle className="w-3 h-3" />
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Authorize Google Calendar and Gmail so the assistant can manage meetings, retrieve schedules, and send or inspect emails.
                  </p>
                </div>
              </div>

              <div>
                {isGoogleComplete ? (
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    disabled={actionLoading === "google_disconnect"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 text-xs font-medium text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={actionLoading === "google_connect"}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md transition-all"
                  >
                    {actionLoading === "google_connect" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    <span>Connect Google</span>
                  </button>
                )}
              </div>
            </div>

            {isGoogleComplete && (
              <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-zinc-300">
                    <Calendar className="w-3 h-3 text-amber-400" /> Calendar Active
                  </span>
                  <span className="flex items-center gap-1 text-zinc-300">
                    <Mail className="w-3 h-3 text-rose-400" /> Gmail Active
                  </span>
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Google Workspace Tools Activated</span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: Workspace Directory Selection */}
          <div
            className={cn(
              "p-4 rounded-xl border transition-all space-y-3",
              isWorkspaceComplete
                ? "bg-emerald-950/10 border-emerald-800/40"
                : "bg-zinc-900/60 border-zinc-800"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0 mt-0.5">
                  <FolderOpen className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-zinc-500 uppercase">
                      Step 3
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Project Workspace Directory
                    </h3>
                    {isWorkspaceComplete ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Configured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-950/80 text-rose-300 border border-rose-800">
                        <AlertCircle className="w-3 h-3" />
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Specify the local absolute project path on your computer. The Filesystem MCP tools will be scoped to read, search, and edit files in this folder.
                  </p>
                </div>
              </div>
            </div>

            {/* Path input and actions */}
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={workspaceInput}
                  onChange={(e) => {
                    setWorkspaceInput(e.target.value);
                    setWorkspaceFeedback(null);
                  }}
                  placeholder="e.g. C:\Users\YourName\Desktop\my-project"
                  spellCheck={false}
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSaveWorkspace}
                  disabled={isSavingWorkspace || !workspaceInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-xs font-semibold text-white shadow-sm transition-colors shrink-0"
                >
                  {isSavingWorkspace ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save Directory</span>
                </button>
              </div>

              {workspaceFeedback && (
                <div
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border text-xs font-mono",
                    workspaceFeedback.type === "success"
                      ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                      : "bg-rose-950/30 border-rose-800/60 text-rose-300"
                  )}
                >
                  {workspaceFeedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{workspaceFeedback.message}</span>
                </div>
              )}

              {isWorkspaceComplete && (
                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
                  <span className="truncate max-w-md text-zinc-300">
                    Active Root: {workspaceSettings?.workspacePath}
                  </span>
                  <button
                    type="button"
                    onClick={handleResetWorkspace}
                    disabled={isResettingWorkspace}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Unlock Action */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            {isAllComplete ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                All 3 setup steps are verified. You can now launch the assistant.
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                All 3 steps are strictly required before proceeding to the assistant.
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!isAllComplete}
            onClick={handleFinalUnlock}
            className={cn(
              "flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg w-full sm:w-auto",
              isAllComplete
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
            )}
          >
            <span>{isAllComplete ? "Launch Personal Assistant" : `Complete All 3 Steps (${completedCount}/3)`}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
