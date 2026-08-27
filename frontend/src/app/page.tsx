"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Thread } from "@/components/assistant-ui/thread";
import { ModelOption, AVAILABLE_MODELS } from "@/components/assistant-ui/model-selector";
import { ToolCallData } from "@/components/assistant-ui/tool-call-preview";
import {
  useBackendRuntime,
  fetchThreads,
  createThreadOnBackend,
  deleteThreadOnBackend,
  ThreadSession,
} from "@/lib/agent-runtime";

export default function Home() {
  const [sessions, setSessions] = useState<ThreadSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(AVAILABLE_MODELS[0]);

  // Load threads from backend
  const refreshSessions = useCallback(async () => {
    const threadList = await fetchThreads();
    if (threadList.length > 0) {
      setSessions(threadList);
      setActiveSessionId((current) => {
        // If current active session is still in list, keep it
        if (current && threadList.some((t) => t.id === current)) {
          return current;
        }
        return threadList[0].id;
      });
    } else {
      // Create initial real thread if none exist
      const newThread = await createThreadOnBackend();
      if (newThread) {
        setSessions([newThread]);
        setActiveSessionId(newThread.id);
      }
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Sample interactive tool calls for UI preview
  const [sampleToolCalls, setSampleToolCalls] = useState<ToolCallData[]>([
    {
      id: "tool-1",
      name: "safe_terminal_execute",
      category: "terminal",
      permissionLevel: "DESTRUCTIVE",
      arguments: {
        command: "git reset --hard HEAD~1",
        workingDirectory: "c:/Users/Ausu vivobook/Desktop/Coding/Personal Assistant Agent",
      },
      status: "pending_approval",
    },
  ]);

  // Real LangGraph Backend Runtime wired to the active session thread ID
  const { runtime, isBackendHealthy } = useBackendRuntime({
    threadId: activeSessionId || "default-session",
    onStreamComplete: refreshSessions,
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleModelSelect = (model: ModelOption) => {
    setSelectedModel(model);
  };

  const handleNewSession = async () => {
    const newThread = await createThreadOnBackend();
    if (newThread) {
      setSessions((prev) => [newThread, ...prev]);
      setActiveSessionId(newThread.id);
    }
  };

  const handleDeleteSession = async (id: string) => {
    const success = await deleteThreadOnBackend(id);
    if (success) {
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (activeSessionId === id) {
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          // If all sessions deleted, spawn a new fresh session
          const newThread = await createThreadOnBackend();
          if (newThread) {
            setSessions([newThread]);
            setActiveSessionId(newThread.id);
          }
        }
      }
    }
  };

  const handleApproveTool = (id: string) => {
    setSampleToolCalls((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "completed",
              output: "Command executed safely in isolated sandbox. Output: HEAD is now at 92c81da",
            }
          : t
      )
    );
  };

  const handleRejectTool = (id: string) => {
    setSampleToolCalls((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "rejected",
              error: "Execution was rejected by user.",
            }
          : t
      )
    );
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased font-sans">
        {/* Navigation Sidebar */}
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          isOpen={isSidebarOpen}
          onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
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

          {/* Assistant Thread */}
          <main className="flex-1 overflow-hidden relative">
            <Thread
              activeModelName="Groq (openai/gpt-oss-120b)"
              sampleToolCalls={sampleToolCalls}
              onApproveTool={handleApproveTool}
              onRejectTool={handleRejectTool}
            />
          </main>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
