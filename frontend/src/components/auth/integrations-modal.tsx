"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Github,
  Calendar,
  Mail,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Zap,
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
import { cn } from "@/lib/utils";

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

export function IntegrationsModal({
  isOpen,
  onClose,
  onStatusChange,
}: IntegrationsModalProps) {
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
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadStatuses = async () => {
    setLoading(true);
    const [gh, ggl] = await Promise.all([
      fetchGitHubStatus(),
      fetchGoogleStatus(),
    ]);
    setGithubStatus(gh);
    setGoogleStatus(ggl);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadStatuses();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectGitHub = async () => {
    setActionLoading("github_connect");
    try {
      const res = await fetchGitHubOAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      } else {
        alert("GitHub OAuth is not configured in backend/.env (missing GITHUB_CLIENT_ID).");
      }
    } catch {
      alert("Failed to initiate GitHub OAuth.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!confirm("Are you sure you want to disconnect GitHub?")) return;
    setActionLoading("github_disconnect");
    await disconnectGitHub();
    await loadStatuses();
    if (onStatusChange) onStatusChange();
    setActionLoading(null);
  };

  const handleConnectGoogle = async () => {
    setActionLoading("google_connect");
    try {
      const res = await fetchGoogleOAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      } else {
        alert("Google OAuth is not configured in backend/.env (missing GOOGLE_CLIENT_ID).");
      }
    } catch {
      alert("Failed to initiate Google OAuth.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm("Are you sure you want to disconnect Google Workspace?")) return;
    setActionLoading("google_disconnect");
    await disconnectGoogle();
    await loadStatuses();
    if (onStatusChange) onStatusChange();
    setActionLoading(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="h-14 px-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Connected Accounts & Integrations
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                Manage OAuth connections for developer tools and workspace APIs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStatuses}
              disabled={loading}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* GitHub Integration Card */}
          <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0">
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">
                      GitHub Integration
                    </h3>
                    {githubStatus.connected ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        {githubStatus.authMethod === "oauth"
                          ? "Connected (OAuth)"
                          : "Connected (PAT)"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                        <AlertCircle className="w-3 h-3" />
                        Disconnected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Enables listing repositories, searching code, managing issues, and PR workflows.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div>
                {githubStatus.authMethod === "oauth" ? (
                  <button
                    type="button"
                    onClick={handleDisconnectGitHub}
                    disabled={actionLoading === "github_disconnect"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-rose-950/50 hover:text-rose-300 hover:border-rose-800 text-xs font-medium text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGitHub}
                    disabled={actionLoading === "github_connect"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-colors"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>{githubStatus.connected ? "Switch to OAuth" : "Connect GitHub"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* GitHub Profile / Scopes detail */}
            {githubStatus.connected && (
              <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap items-center justify-between text-xs text-zinc-400 font-mono gap-2">
                {githubStatus.user ? (
                  <div className="flex items-center gap-2">
                    {githubStatus.user.avatar_url && (
                      <img
                        src={githubStatus.user.avatar_url}
                        alt="GitHub Avatar"
                        className="w-5 h-5 rounded-full border border-zinc-700"
                      />
                    )}
                    <span className="text-zinc-200">
                      @{githubStatus.user.login}
                    </span>
                    {githubStatus.user.name && (
                      <span className="text-zinc-500">
                        ({githubStatus.user.name})
                      </span>
                    )}
                  </div>
                ) : (
                  <span>Auth Method: Personal Access Token</span>
                )}

                <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Scopes: repo, read:user, workflow</span>
                </div>
              </div>
            )}
          </div>

          {/* Google Workspace Integration Card */}
          <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0">
                  <div className="flex gap-1">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <Mail className="w-4 h-4 text-rose-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">
                      Google Workspace (Calendar & Gmail)
                    </h3>
                    {googleStatus.configured && googleStatus.mode === "live" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Connected (Live API)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/80">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        Sandbox Mode (Local Store)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Allows the agent to schedule meetings, read event calendars, and draft or send emails.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div>
                {googleStatus.configured && googleStatus.mode === "live" ? (
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    disabled={actionLoading === "google_disconnect"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-rose-950/50 hover:text-rose-300 hover:border-rose-800 text-xs font-medium text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={actionLoading === "google_connect"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Connect Google</span>
                  </button>
                )}
              </div>
            </div>

            {/* Google Capabilities detail */}
            <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap items-center justify-between text-xs text-zinc-400 font-mono gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-zinc-300">
                  <Calendar className="w-3 h-3 text-amber-400" /> Google Calendar
                </span>
                <span className="flex items-center gap-1 text-zinc-300">
                  <Mail className="w-3 h-3 text-rose-400" /> Gmail
                </span>
              </div>

              <div className="text-[11px] text-zinc-500">
                {googleStatus.email ? (
                  <span>Account: {googleStatus.email}</span>
                ) : googleStatus.mode === "live" ? (
                  <span>Status: Authorized via OAuth</span>
                ) : (
                  <span>Mock Sandbox Active</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-zinc-800/80 flex items-center justify-between bg-zinc-900/40 text-xs text-zinc-500 font-mono">
          <span>Security: OAuth tokens stored locally with restricted scope.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
