"use client";

import React, { useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Sidebar, ChatSession } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Thread } from "@/components/assistant-ui/thread";
import { ModelOption, AVAILABLE_MODELS } from "@/components/assistant-ui/model-selector";
import { ToolCallData } from "@/components/assistant-ui/tool-call-preview";
import { useAssistantMockRuntime } from "@/lib/mock-runtime";

const INITIAL_SESSIONS: ChatSession[] = [
  {
    id: "session-1",
    title: "Repository Analysis & Architecture",
    updatedAt: "Just now",
    model: "Llama 3.2 3B",
    messageCount: 3,
  },
  {
    id: "session-2",
    title: "GitHub MCP Pull Request Review",
    updatedAt: "2 hours ago",
    model: "Claude 3.5 Sonnet",
    messageCount: 7,
  },
  {
    id: "session-3",
    title: "Terminal Permission Gate Testing",
    updatedAt: "Yesterday",
    model: "Qwen 2.5 Coder 7B",
    messageCount: 12,
  },
];

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>("session-1");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(AVAILABLE_MODELS[0]);

  // Sample interactive tool calls for UI testing and verification
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

  // Assistant local mock runtime
  const { runtime, setModelName } = useAssistantMockRuntime(selectedModel.name);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const handleModelSelect = (model: ModelOption) => {
    setSelectedModel(model);
    setModelName(model.name);
  };

  const handleNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: "New Conversation",
      updatedAt: "Just now",
      model: selectedModel.name,
      messageCount: 0,
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
  };

  const handleDeleteSession = (id: string) => {
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (activeSessionId === id && remaining.length > 0) {
      setActiveSessionId(remaining[0].id);
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
          />

          {/* Assistant Thread */}
          <main className="flex-1 overflow-hidden relative">
            <Thread
              activeModelName={selectedModel.name}
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
