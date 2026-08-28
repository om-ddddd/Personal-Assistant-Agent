"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  AssistantJobRecord,
  JobStatus,
  fetchUserJobs,
  cancelJob,
  enqueueJob,
} from "@/lib/jobs-client";
import {
  X,
  Play,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  FileCode2,
  ShieldCheck,
  Database,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

interface JobsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JobsDrawer({ isOpen, onClose }: JobsDrawerProps) {
  const [jobs, setJobs] = useState<AssistantJobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<AssistantJobRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isStartingNewJob, setIsStartingNewJob] = useState(false);
  const [newJobTarget, setNewJobTarget] = useState<string>(".");

  const refreshJobs = useCallback(async () => {
    try {
      const data = await fetchUserJobs();
      setJobs(data);
      if (selectedJob) {
        const updated = data.find((j) => j.id === selectedJob.id);
        if (updated) {
          setSelectedJob(updated);
        }
      }
    } catch {
      // Ignore poll error
    }
  }, [selectedJob]);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    refreshJobs().finally(() => setIsLoading(false));

    const interval = setInterval(refreshJobs, 3000);
    return () => clearInterval(interval);
  }, [isOpen, refreshJobs]);

  const handleCancelJob = async (jobId: string) => {
    await cancelJob(jobId);
    await refreshJobs();
  };

  const handleStartAnalysis = async () => {
    setIsStartingNewJob(true);
    try {
      await enqueueJob({
        type: "REPO_ANALYSIS",
        title: `Workspace Analysis (${newJobTarget})`,
        targetPath: newJobTarget,
      });
      await refreshJobs();
    } finally {
      setIsStartingNewJob(false);
    }
  };

  if (!isOpen) return null;

  const filteredJobs = jobs.filter((j) => {
    if (filterStatus === "ALL") return true;
    return j.status === filterStatus;
  });

  const activeCount = jobs.filter((j) => j.status === "ACTIVE" || j.status === "PENDING").length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <RotateCw className={`w-4 h-4 ${activeCount > 0 ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h2 className="font-semibold text-zinc-100 text-sm flex items-center gap-2">
                Background Task Manager
                {activeCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/40">
                    {activeCount} running
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">Redis 8 + BullMQ Asynchronous Processing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Launch Bar */}
        <div className="p-3 bg-zinc-900/50 border-b border-zinc-800/80 flex items-center gap-2">
          <input
            type="text"
            value={newJobTarget}
            onChange={(e) => setNewJobTarget(e.target.value)}
            placeholder="Target folder (e.g. '.', 'backend', 'frontend')"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 font-mono"
          />
          <button
            onClick={handleStartAnalysis}
            disabled={isStartingNewJob}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isStartingNewJob ? "Starting..." : "Run Analysis"}
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-2 bg-zinc-900/30 border-b border-zinc-800/50 flex gap-2">
          {["ALL", "ACTIVE", "COMPLETED", "FAILED"].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                filterStatus === status
                  ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Job List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs">
              <RotateCw className="w-5 h-5 animate-spin mb-2" />
              Loading tasks...
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs">
              <Clock className="w-6 h-6 mb-2 text-zinc-600" />
              No background tasks found in this view.
            </div>
          ) : (
            filteredJobs.map((job) => {
              const isRunning = job.status === "ACTIVE" || job.status === "PENDING";
              const isCompleted = job.status === "COMPLETED";
              const isFailed = job.status === "FAILED";
              const isCancelled = job.status === "CANCELLED";

              return (
                <div
                  key={job.id}
                  className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3.5 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {job.type === "REPO_ANALYSIS" && <FileCode2 className="w-4 h-4 text-sky-400" />}
                      {job.type === "SECURITY_AUDIT" && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                      {job.type === "BATCH_EMBEDDING" && <Database className="w-4 h-4 text-purple-400" />}
                      <span className="font-medium text-xs text-zinc-200">{job.title}</span>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono rounded border flex items-center gap-1 ${
                        isRunning
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          : isCompleted
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : isCancelled
                          ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                          : "bg-red-500/10 text-red-300 border-red-500/30"
                      }`}
                    >
                      {isRunning && <RotateCw className="w-2.5 h-2.5 animate-spin" />}
                      {isCompleted && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {isFailed && <AlertCircle className="w-2.5 h-2.5" />}
                      {isCancelled && <Ban className="w-2.5 h-2.5" />}
                      {job.status}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1 mb-2.5">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                      <span>{job.progress.stage || "PROGRESS"}</span>
                      <span>{job.progress.percentage}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCompleted
                            ? "bg-emerald-500"
                            : isFailed
                            ? "bg-red-500"
                            : isCancelled
                            ? "bg-zinc-600"
                            : "bg-gradient-to-r from-sky-500 to-emerald-500"
                        }`}
                        style={{ width: `${job.progress.percentage}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 truncate">{job.progress.message}</p>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50 text-[11px]">
                    <span className="font-mono text-zinc-500">ID: {job.id.slice(0, 16)}</span>
                    <div className="flex items-center gap-2">
                      {isRunning && (
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      {job.result && (
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10px] flex items-center gap-1 transition-colors"
                        >
                          View Report
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Report Modal */}
        {selectedJob && selectedJob.result && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{selectedJob.title}</h3>
                  <p className="text-xs text-zinc-400">
                    Execution Duration: {(selectedJob.result.durationMs / 1000).toFixed(2)}s
                  </p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {selectedJob.result.reportMarkdown}
              </div>

              <div className="p-3 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setSelectedJob(null)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
