"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AssistantRuntimeProvider, type ThreadMessageLike } from "@assistant-ui/react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Thread } from "@/components/assistant-ui/thread";
import { ModelOption, AVAILABLE_MODELS } from "@/components/assistant-ui/model-selector";
import {
  useBackendRuntime,
  fetchThreads,
  fetchThreadHistory,
  createThreadOnBackend,
  deleteThreadOnBackend,
  ThreadSession,
} from "@/lib/agent-runtime";
import {
  Loader2,
  Plus,
  Terminal,
  Cpu,
  Shield,
} from "lucide-react";

interface ActiveChatProps {
  threadId: string;
  onStreamComplete: () => void;
  onHealthStatusChange?: (healthy: boolean | null) => void;
}

function ActiveChatSession({
  threadId,
  onStreamComplete,
  onHealthStatusChange,
}: ActiveChatProps) {
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [initialMessages, setInitialMessages] = useState<ThreadMessageLike[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      setHistoryLoaded(false);
      const rawHistory = await fetchThreadHistory(threadId);
      if (!isMounted) return;

      const formatted: ThreadMessageLike[] = rawHistory.map((m) => ({
        id: m.id,
        role: m.role,
        content: [{ type: "text", text: m.content }],
      }));

      setInitialMessages(formatted);
      setHistoryLoaded(true);
    }

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [threadId]);

  if (!historyLoaded) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-zinc-500 font-mono text-xs">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        <span>Loading conversation history...</span>
      </div>
    );
  }

  return (
    <ActiveChatSessionInner
      threadId={threadId}
      initialMessages={initialMessages}
      onStreamComplete={onStreamComplete}
      onHealthStatusChange={onHealthStatusChange}
    />
  );
}

function ActiveChatSessionInner({
  threadId,
  initialMessages,
  onStreamComplete,
  onHealthStatusChange,
}: {
  threadId: string;
  initialMessages: ThreadMessageLike[];
  onStreamComplete: () => void;
  onHealthStatusChange?: (healthy: boolean | null) => void;
}) {
  const { runtime, isBackendHealthy } = useBackendRuntime({
    threadId,
    initialMessages,
    onStreamComplete,
  });

  useEffect(() => {
    onHealthStatusChange?.(isBackendHealthy);
  }, [isBackendHealthy, onHealthStatusChange]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread activeModelName="Groq (openai/gpt-oss-120b)" />
    </AssistantRuntimeProvider>
  );
}

/**
 * Centered Hero state when no conversation is active
 */
function StartConversationHero({
  onStartNew,
  isCreating,
}: {
  onStartNew: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center select-none bg-radial-glow overflow-y-auto">
      <div className="max-w-md w-full space-y-6 flex flex-col items-center">
        {/* Animated Brand Badge */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center shadow-2xl shadow-indigo-950/60">
            <Terminal className="w-8 h-8 text-indigo-400" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-950 border border-emerald-800/80 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Hero Title & Description */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
            Developer Personal Assistant
          </h2>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            LangGraph multi-agent engine powered by Groq. Start a new conversation to analyze code, run arithmetic calculations, and manage developer workflows.
          </p>
        </div>

        {/* Primary Start Conversation Action */}
        <button
          type="button"
          onClick={onStartNew}
          disabled={isCreating}
          className="group relative flex items-center gap-2.5 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-950/80 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 text-indigo-200 group-hover:rotate-90 transition-transform duration-200" />
          )}
          <span>Start New Conversation</span>
        </button>

        {/* Capability Feature Cards */}
        <div className="grid grid-cols-2 gap-2.5 w-full pt-4 text-left">
          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tool Execution</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Integrated calculator, system time, and GitHub tools.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Thread Memory</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              State checkpoints preserved per session.
            </p>
          </div>
        </div>

        <p className="text-[11px] font-mono text-zinc-600">
          Click above or use the sidebar to begin.
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const [sessions, setSessions] = useState<ThreadSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(AVAILABLE_MODELS[0]);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Load threads from backend
  const refreshSessions = useCallback(async () => {
    const threadList = await fetchThreads();
    setSessions(threadList);
    if (threadList.length > 0) {
      setActiveSessionId((current) => {
        if (current && threadList.some((t) => t.id === current)) {
          return current;
        }
        const savedId = typeof window !== "undefined" ? localStorage.getItem("last_active_thread_id") : null;
        if (savedId && threadList.some((t) => t.id === savedId)) {
          return savedId;
        }
        return threadList[0].id;
      });
    } else {
      setActiveSessionId("");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const threadList = await fetchThreads();
      if (!isMounted) return;
      setSessions(threadList);
      if (threadList.length > 0) {
        const savedId = typeof window !== "undefined" ? localStorage.getItem("last_active_thread_id") : null;
        if (savedId && threadList.some((t) => t.id === savedId)) {
          setActiveSessionId(savedId);
        } else {
          setActiveSessionId(threadList[0].id);
        }
      } else {
        setActiveSessionId("");
      }
      setIsLoadingSessions(false);
    }

    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("last_active_thread_id", id);
    }
  };

  const handleModelSelect = (model: ModelOption) => {
    setSelectedModel(model);
  };

  const handleStartNewSession = async () => {
    if (activeSession && activeSession.messageCount === 0) {
      return;
    }

    setIsCreatingSession(true);
    try {
      const newThread = await createThreadOnBackend();
      if (newThread) {
        setSessions((prev) => [newThread, ...prev]);
        setActiveSessionId(newThread.id);
        if (typeof window !== "undefined") {
          localStorage.setItem("last_active_thread_id", newThread.id);
        }
      }
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    const success = await deleteThreadOnBackend(id);
    if (success) {
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (activeSessionId === id) {
        const nextId = remaining.length > 0 ? remaining[0].id : "";
        setActiveSessionId(nextId);
        if (typeof window !== "undefined") {
          if (nextId) {
            localStorage.setItem("last_active_thread_id", nextId);
          } else {
            localStorage.removeItem("last_active_thread_id");
          }
        }
      }
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased font-sans">
      {/* Navigation Sidebar */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleStartNewSession}
        onDeleteSession={handleDeleteSession}
        isOpen={isSidebarOpen}
        onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
        isNewSessionDisabled={activeSession ? activeSession.messageCount === 0 : false}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Header Bar */}
        <Header
          sessionTitle={activeSession ? activeSession.title : "Assistant Cockpit"}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          selectedModelId={selectedModel.id}
          onModelSelect={handleModelSelect}
          isBackendHealthy={isBackendHealthy}
        />

        {/* Assistant Main Canvas */}
        <main className="flex-1 overflow-hidden relative">
          {isLoadingSessions ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-zinc-500 font-mono text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span>Loading workspace...</span>
            </div>
          ) : activeSessionId ? (
            <ActiveChatSession
              key={activeSessionId}
              threadId={activeSessionId}
              onStreamComplete={refreshSessions}
              onHealthStatusChange={setIsBackendHealthy}
            />
          ) : (
            <StartConversationHero
              onStartNew={handleStartNewSession}
              isCreating={isCreatingSession}
            />
          )}
        </main>
      </div>
    </div>
  );
}
