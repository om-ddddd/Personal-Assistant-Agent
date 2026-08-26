"use client";

import React, { useState } from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  ArrowUp,
  Square,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Bot,
  User,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Code2,
  ShieldAlert,
  GitBranch,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolCallPreview, ToolCallData } from "./tool-call-preview";

interface ThreadProps {
  activeModelName?: string;
  sampleToolCalls?: ToolCallData[];
  onApproveTool?: (id: string) => void;
  onRejectTool?: (id: string) => void;
}

export function Thread({
  activeModelName = "Llama 3.2 3B",
  sampleToolCalls = [],
  onApproveTool,
  onRejectTool,
}: ThreadProps) {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full bg-zinc-950/50 relative overflow-hidden">
      {/* Messages Viewport */}
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Empty State */}
        <ThreadPrimitive.Empty>
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 max-w-2xl mx-auto space-y-8">
            <div className="space-y-3">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-indigo-950/60 border border-indigo-800/50 shadow-inner">
                <Terminal className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
                Developer Personal Assistant
              </h2>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Autonomous coding agent with local LLM support, LangGraph execution,
                and permission-gated MCP tools.
              </p>
            </div>

            {/* Prompt Starter Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
              <ThreadPrimitive.Suggestion
                prompt="Inspect the repository workspace structure and summarize top-level files"
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300">
                    Inspect Workspace
                  </span>
                  <Code2 className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Inspect the repository file tree and package configuration.
                </p>
              </ThreadPrimitive.Suggestion>

              <ThreadPrimitive.Suggestion
                prompt="Explain how the Tool Security Gate validates READ, WRITE, and DESTRUCTIVE actions"
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300">
                    Tool Security Gate
                  </span>
                  <ShieldAlert className="w-4 h-4 text-zinc-500 group-hover:text-amber-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Review permission enforcement for read, write, and destructive actions.
                </p>
              </ThreadPrimitive.Suggestion>

              <ThreadPrimitive.Suggestion
                prompt="Show a sample TypeScript LangGraph StateGraph node for tool execution"
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300">
                    LangGraph Tool Node
                  </span>
                  <GitBranch className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Explore how LangGraph tool nodes execute with checkpointing.
                </p>
              </ThreadPrimitive.Suggestion>

              <ThreadPrimitive.Suggestion
                prompt="Test model switching between Local Ollama and Cloud inference"
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-cyan-300">
                    Switch Models
                  </span>
                  <Sparkles className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Learn how local and cloud LLM providers are dynamically instantiated.
                </p>
              </ThreadPrimitive.Suggestion>
            </div>
          </div>
        </ThreadPrimitive.Empty>

        {/* Message List */}
        <ThreadPrimitive.Messages
          components={{
            UserMessage: CustomUserMessage,
            AssistantMessage: CustomAssistantMessage,
          }}
        />

        {/* Render sample tool preview cards if any */}
        {sampleToolCalls.map((toolCall) => (
          <ToolCallPreview
            key={toolCall.id}
            toolCall={toolCall}
            onApprove={onApproveTool}
            onReject={onRejectTool}
          />
        ))}

        <ThreadPrimitive.ScrollToBottom className="absolute bottom-24 right-6 p-2 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 shadow-lg transition-all" />
      </ThreadPrimitive.Viewport>

      {/* Chat Composer Bar */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md max-w-4xl mx-auto w-full">
        <ComposerPrimitive.Root className="relative flex flex-col rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-xl focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
          <ComposerPrimitive.Input
            placeholder="Ask a question, run a command, or request code modifications..."
            className="w-full px-4 py-3 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 resize-none outline-none max-h-40 min-h-[52px] leading-relaxed font-sans"
            rows={1}
            autoFocus
          />

          <div className="px-3 pb-2.5 flex items-center justify-between gap-2 border-t border-zinc-800/40 pt-2">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
              <span className="hidden sm:inline">Active Model:</span>
              <span className="text-zinc-300 font-medium">{activeModelName}</span>
              <span className="hidden md:inline text-zinc-600">|</span>
              <span className="hidden md:inline text-zinc-500">
                Shift + Enter for new line
              </span>
            </div>

            <div className="flex items-center gap-2">
              <ComposerPrimitive.Cancel className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                <Square className="w-4 h-4 fill-current" />
              </ComposerPrimitive.Cancel>

              <ComposerPrimitive.Send className="p-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <ArrowUp className="w-4 h-4" />
              </ComposerPrimitive.Send>
            </div>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}

/**
 * User Message Component
 */
function CustomUserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end gap-3 group">
      <div className="max-w-2xl bg-indigo-600/15 border border-indigo-500/30 rounded-2xl rounded-tr-none px-4 py-2.5 text-zinc-100 text-xs shadow-sm">
        <MessagePrimitive.Content />
      </div>
      <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
        <User className="w-4 h-4" />
      </div>
    </MessagePrimitive.Root>
  );
}

const MarkdownText: React.FC = () => {
  return <MarkdownTextPrimitive />;
};

/**
 * Assistant Message Component
 */
function CustomAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex items-start gap-3 group">
      <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-emerald-400" />
      </div>

      <div className="flex-1 space-y-2 max-w-3xl min-w-0">
        <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl rounded-tl-none p-4 text-xs text-zinc-200 space-y-2 leading-relaxed shadow-sm">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownText,
            }}
          />
        </div>

        {/* Action bar and branch picker */}
        <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
          <ActionBarPrimitive.Root className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ActionBarPrimitive.Copy
              className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Copy response"
            >
              <Copy className="w-3.5 h-3.5" />
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload
              className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Regenerate response"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </ActionBarPrimitive.Reload>
          </ActionBarPrimitive.Root>

          <BranchPickerPrimitive.Root className="flex items-center gap-1 font-mono text-[10px] ml-auto">
            <BranchPickerPrimitive.Previous className="p-0.5 rounded hover:bg-zinc-800 hover:text-zinc-300">
              <ChevronLeft className="w-3 h-3" />
            </BranchPickerPrimitive.Previous>
            <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
            <BranchPickerPrimitive.Next className="p-0.5 rounded hover:bg-zinc-800 hover:text-zinc-300">
              <ChevronRight className="w-3 h-3" />
            </BranchPickerPrimitive.Next>
          </BranchPickerPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
