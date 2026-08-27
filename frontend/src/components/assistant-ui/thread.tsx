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
  ChevronDown,
  Sparkles,
  Code2,
  ShieldAlert,
  GitBranch,
  Wrench,
  Calculator,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ThreadProps {
  activeModelName?: string;
}

export function Thread({
  activeModelName = "Groq (openai/gpt-oss-120b)",
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
                prompt="List all files and folders in the workspace root directory using the list_directory tool."
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-cyan-300">
                    Filesystem MCP Listing
                  </span>
                  <Code2 className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Inspect workspace structure using @modelcontextprotocol/server-filesystem.
                </p>
              </ThreadPrimitive.Suggestion>

              <ThreadPrimitive.Suggestion
                prompt="Read package.json from the project directory and explain its dependencies."
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300">
                    Read File via MCP
                  </span>
                  <Terminal className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Fetch and analyze file contents with read_text_file MCP tool.
                </p>
              </ThreadPrimitive.Suggestion>

              <ThreadPrimitive.Suggestion
                prompt="Calculate (1548 * 372) / 12 and tell me the current time in Tokyo and London"
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300">
                    Multi-Tool Math & Time
                  </span>
                  <Calculator className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Execute calculator and timezone lookup tools simultaneously.
                </p>
              </ThreadPrimitive.Suggestion>

              <ThreadPrimitive.Suggestion
                prompt="Search for all typescript files matching '*.ts' in the project workspace using search_files tool."
                method="replace"
                autoSend
                className="group p-3.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-amber-300">
                    Search Files via MCP
                  </span>
                  <Sparkles className="w-4 h-4 text-zinc-500 group-hover:text-amber-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Glob search project files using search_files MCP tool.
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

        <ThreadPrimitive.ScrollToBottom className="absolute bottom-24 right-6 p-2 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 shadow-lg transition-all" />
      </ThreadPrimitive.Viewport>

      {/* Chat Composer Bar */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md max-w-4xl mx-auto w-full">
        <ComposerPrimitive.Root className="relative flex flex-col rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-xl focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
          <ComposerPrimitive.Input
            placeholder="Ask a question, run a calculation, or request timezone lookups..."
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
 * Interactive Collapsible Tool Execution Card Component
 */
function ToolAccordion({
  toolName,
  parameters,
  result,
  status = "completed",
}: {
  toolName: string;
  parameters: string;
  result?: string;
  status?: "running" | "completed";
}) {
  const [isOpen, setIsOpen] = useState(false);

  let ToolIcon = Wrench;
  if (toolName.toLowerCase().includes("calc")) {
    ToolIcon = Calculator;
  } else if (toolName.toLowerCase().includes("time")) {
    ToolIcon = Clock;
  }

  // Format parameters JSON if valid
  let formattedParams = parameters;
  try {
    const parsed = JSON.parse(parameters);
    formattedParams = JSON.stringify(parsed, null, 2);
  } catch {
    // raw string
  }

  return (
    <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/90 shadow-sm overflow-hidden text-xs transition-all">
      {/* Clickable Header Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between gap-3 bg-zinc-900 hover:bg-zinc-800/80 text-zinc-200 transition-colors select-none text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <ToolIcon className="w-3 h-3" />
          </div>
          <span className="font-mono font-semibold text-zinc-200 truncate">
            Tool: {toolName}
          </span>
          {status === "running" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/60 text-amber-300 animate-pulse shrink-0">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Executing
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 shrink-0">
              <Check className="w-2.5 h-2.5 text-emerald-400" />
              Executed
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-zinc-400 shrink-0">
          <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
            {isOpen ? "Hide" : "Details"}
          </span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-zinc-400 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expandable Parameters & Output Drawer */}
      {isOpen && (
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/80 space-y-2 font-mono text-[11px]">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
              Parameters
            </div>
            <pre className="p-2 rounded bg-zinc-900 border border-zinc-800 text-indigo-300 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
              {formattedParams}
            </pre>
          </div>

          {result && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                Result
              </div>
              <pre className="p-2 rounded bg-zinc-900 border border-zinc-800 text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function extractNodeText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractNodeText).join("");
  if (React.isValidElement(node) && node.props && (node.props as any).children) {
    return extractNodeText((node.props as any).children);
  }
  return "";
}

/**
 * Custom Blockquote that intercepts tool call markdown patterns and renders ToolAccordion
 */
function CustomBlockquote(props: React.ComponentPropsWithoutRef<"blockquote">) {
  const textContent = extractNodeText(props.children);

  if (textContent.includes("Tool Executed:") || textContent.includes("Tool Call:")) {
    const toolMatch = textContent.match(/Tool (?:Executed|Call):\s*`?([a-zA-Z0-9_-]+)`?/i);
    const paramMatch = textContent.match(/Parameters:\s*`?([\s\S]*?)`?(?:\s*-\s*Result:|\s*-\s*Status:|$)/i);
    const resultMatch = textContent.match(/Result:\s*`?([\s\S]*?)`?$/im);
    const statusMatch = textContent.match(/Status:\s*`?([a-zA-Z0-9_.-]+)`?/i);

    const toolName = toolMatch ? toolMatch[1] : "tool";
    const parameters = paramMatch ? paramMatch[1].trim() : "{}";
    const result = resultMatch ? resultMatch[1].trim() : undefined;
    const isRunning = statusMatch ? statusMatch[1].toLowerCase().includes("executing") : false;

    return (
      <ToolAccordion
        toolName={toolName}
        parameters={parameters}
        result={result}
        status={isRunning ? "running" : "completed"}
      />
    );
  }

  return (
    <blockquote className="border-l-2 border-indigo-500/50 pl-3.5 my-2 text-zinc-400 italic text-xs">
      {props.children}
    </blockquote>
  );
}

const MarkdownText: React.FC = () => {
  return (
    <MarkdownTextPrimitive
      components={{
        blockquote: CustomBlockquote,
      }}
    />
  );
};

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
