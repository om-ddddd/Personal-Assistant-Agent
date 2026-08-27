"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Search,
  RefreshCw,
  X,
  Play,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Mail,
  FileCode,
  GitBranch,
  Terminal,
  Calculator,
  Lock,
  Layers,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ToolRiskLevel,
  ToolPermissionEntry,
  PermissionRegistryResponse,
  PendingConfirmation,
  fetchPermissionRegistry,
  fetchPendingConfirmations,
  confirmToolExecution,
} from "@/lib/agent-runtime";

interface PermissionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshThreads?: () => void;
}

export function PermissionManagerModal({
  isOpen,
  onClose,
  onRefreshThreads,
}: PermissionManagerModalProps) {
  const [activeTab, setActiveTab] = useState<"registry" | "pending">("registry");
  const [registryData, setRegistryData] = useState<PermissionRegistryResponse | null>(null);
  const [pendingList, setPendingList] = useState<PendingConfirmation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<string>("ALL");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [registry, pending] = await Promise.all([
      fetchPermissionRegistry(),
      fetchPendingConfirmations(),
    ]);
    setRegistryData(registry);
    setPendingList(pending);
    setIsLoading(false);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle Approve / Reject from the modal
  const handlePendingDecision = async (threadId: string, confirmationId: string, approved: boolean) => {
    setActionLoadingId(confirmationId);
    try {
      await confirmToolExecution(threadId, approved);
      await loadData();
      onRefreshThreads?.();
    } catch (err) {
      console.error("Failed to resolve pending confirmation:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter tools
  const filteredTools = useMemo(() => {
    if (!registryData) return [];
    let list = registryData.tools;

    if (selectedRiskFilter !== "ALL") {
      list = list.filter((t) => t.riskLevel === selectedRiskFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.toolName.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    return list;
  }, [registryData, selectedRiskFilter, searchQuery]);

  const getCategoryIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("calendar")) return <Calendar className="w-3.5 h-3.5 text-indigo-400" />;
    if (n.includes("email") || n.includes("mail") || n.includes("gmail")) return <Mail className="w-3.5 h-3.5 text-amber-400" />;
    if (n.includes("file") || n.includes("directory")) return <FileCode className="w-3.5 h-3.5 text-cyan-400" />;
    if (n.includes("github") || n.includes("repo") || n.includes("issue") || n.includes("pull_request") || n.includes("branch")) return <GitBranch className="w-3.5 h-3.5 text-purple-400" />;
    if (n.includes("calc")) return <Calculator className="w-3.5 h-3.5 text-emerald-400" />;
    if (n.includes("time")) return <Clock className="w-3.5 h-3.5 text-blue-400" />;
    return <Terminal className="w-3.5 h-3.5 text-zinc-400" />;
  };

  if (!isOpen) return null;

  const totalTools = registryData?.total || 0;
  const readCount = registryData?.summary?.READ?.length || 0;
  const writeCount = registryData?.summary?.WRITE?.length || 0;
  const destructiveCount = registryData?.summary?.DESTRUCTIVE?.length || 0;
  const pendingCount = pendingList.filter((p) => p.status === "PENDING").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 font-sans">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/80 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100 tracking-tight">
                  Tool Permission Manager & Guardrails
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                  Enforced
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Classification-based access control and Human-in-the-Loop (HITL) gate
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700"
              title="Refresh Registry"
            >
              <RefreshCw className={cn("w-4 h-4", (isRefreshing || isLoading) && "animate-spin")} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700"
              title="Close Dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="p-6 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/30 border-b border-zinc-800/60">
          <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
              Total Tools
            </div>
            <div className="text-xl font-bold text-zinc-100 font-mono">
              {totalTools}
            </div>
            <div className="text-[11px] text-zinc-500">Registered agent tools</div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/50 space-y-1">
            <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              READ (Safe)
            </div>
            <div className="text-xl font-bold text-emerald-300 font-mono">
              {readCount}
            </div>
            <div className="text-[11px] text-zinc-500">Immediate execution</div>
          </div>

          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/50 space-y-1">
            <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              WRITE (HITL)
            </div>
            <div className="text-xl font-bold text-amber-300 font-mono">
              {writeCount}
            </div>
            <div className="text-[11px] text-zinc-500">Requires confirmation</div>
          </div>

          <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/50 space-y-1">
            <div className="text-[10px] font-mono text-rose-400 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              DESTRUCTIVE
            </div>
            <div className="text-xl font-bold text-rose-300 font-mono">
              {destructiveCount}
            </div>
            <div className="text-[11px] text-zinc-500">Danger warning gate</div>
          </div>
        </div>

        {/* Tab Selector and Filters */}
        <div className="px-6 pt-3 pb-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-zinc-800/60 bg-zinc-950">
          <div className="flex items-center gap-1.5 p-1 bg-zinc-900 rounded-xl border border-zinc-800 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab("registry")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                activeTab === "registry"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tool Registry ({totalTools})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 relative",
                activeTab === "pending"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Approvals</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-zinc-950 animate-pulse">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === "registry" && (
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {/* Risk Level Filter Chips */}
              <div className="flex items-center gap-1 text-xs">
                {["ALL", "READ", "WRITE", "DESTRUCTIVE"].map((risk) => (
                  <button
                    key={risk}
                    type="button"
                    onClick={() => setSelectedRiskFilter(risk)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors border",
                      selectedRiskFilter === risk
                        ? "bg-zinc-800 text-zinc-100 border-zinc-700 font-semibold"
                        : "bg-transparent text-zinc-500 border-transparent hover:text-zinc-300"
                    )}
                  >
                    {risk}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative flex-1 sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tools..."
                  className="w-full pl-8 pr-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500/80 transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* Tab Content Canvas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-xs font-mono">Loading permission registry...</span>
            </div>
          ) : activeTab === "registry" ? (
            <div className="space-y-2">
              {filteredTools.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  No tools found matching your filter or search criteria.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {filteredTools.map((tool) => (
                    <div
                      key={tool.toolName}
                      className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                          {getCategoryIcon(tool.toolName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                              {tool.toolName}
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-mono font-semibold border",
                                tool.riskLevel === "READ"
                                  ? "bg-emerald-950/70 border-emerald-800/60 text-emerald-400"
                                  : tool.riskLevel === "WRITE"
                                  ? "bg-amber-950/70 border-amber-800/60 text-amber-400"
                                  : "bg-rose-950/70 border-rose-800/60 text-rose-400"
                              )}
                            >
                              {tool.riskLevel}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                            {tool.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 sm:self-center">
                        <span
                          className={cn(
                            "text-[10px] font-mono px-2 py-1 rounded-md border",
                            tool.riskLevel === "READ"
                              ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/40"
                              : tool.riskLevel === "WRITE"
                              ? "bg-amber-950/30 text-amber-300 border-amber-900/40"
                              : "bg-rose-950/30 text-rose-300 border-rose-900/40"
                          )}
                        >
                          {tool.riskLevel === "READ"
                            ? "Immediate Execution"
                            : tool.riskLevel === "WRITE"
                            ? "HITL Confirmation"
                            : "Danger Warning + Confirmation"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Pending Approvals Tab */
            <div className="space-y-3">
              {pendingList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-zinc-300">
                      No Pending Confirmations
                    </h3>
                    <p className="text-[11px] text-zinc-500 max-w-sm">
                      All tool execution requests have been reviewed. When the agent triggers a WRITE or DESTRUCTIVE action, it will pause and appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingList.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-xl border space-y-3",
                        item.status === "PENDING"
                          ? item.riskLevel === "DESTRUCTIVE"
                            ? "bg-rose-950/20 border-rose-800/70"
                            : "bg-amber-950/20 border-amber-800/70"
                          : "bg-zinc-900/40 border-zinc-800"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded bg-zinc-800">
                            {getCategoryIcon(item.toolName)}
                          </div>
                          <span className="font-mono text-xs font-bold text-zinc-100">
                            {item.toolName}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono font-bold border",
                              item.riskLevel === "DESTRUCTIVE"
                                ? "bg-rose-950 border-rose-700 text-rose-400"
                                : "bg-amber-950 border-amber-700 text-amber-400"
                            )}
                          >
                            {item.riskLevel}
                          </span>
                        </div>

                        <div className="text-[10px] font-mono text-zinc-500">
                          Thread: {item.threadId.slice(0, 8)}...
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-mono text-zinc-400">
                          Parameters
                        </div>
                        <pre className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-indigo-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(item.toolArgs, null, 2)}
                        </pre>
                      </div>

                      {item.status === "PENDING" && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/60">
                          <button
                            type="button"
                            disabled={actionLoadingId === item.id}
                            onClick={() => handlePendingDecision(item.threadId, item.id, false)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Deny</span>
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingId === item.id}
                            onClick={() => handlePendingDecision(item.threadId, item.id, true)}
                            className={cn(
                              "px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50",
                              item.riskLevel === "DESTRUCTIVE"
                                ? "bg-rose-600 hover:bg-rose-500 text-white"
                                : "bg-amber-500 hover:bg-amber-400 text-zinc-950"
                            )}
                          >
                            {actionLoadingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            <span>Approve & Execute</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info note */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Safe-by-default policy: Unknown tools default to WRITE requirement.</span>
          </div>
          <span className="font-mono text-[10px]">LangGraph HITL v0.6</span>
        </div>
      </div>
    </div>
  );
}
