"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Cpu, Cloud, Check, Server, Sparkles, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  name: string;
  provider: "ollama" | "lmstudio" | "anthropic" | "openai" | "google";
  providerLabel: string;
  type: "local" | "cloud";
  description: string;
  contextWindow?: string;
  isDefault?: boolean;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "ollama:llama3.2",
    name: "Llama 3.2 3B",
    provider: "ollama",
    providerLabel: "Ollama Local",
    type: "local",
    description: "Fast local inference for quick editing and summarization",
    contextWindow: "128k",
    isDefault: true,
  },
  {
    id: "ollama:qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    provider: "ollama",
    providerLabel: "Ollama Local",
    type: "local",
    description: "Specialized for coding, refactoring, and code review",
    contextWindow: "32k",
  },
  {
    id: "ollama:deepseek-r1:8b",
    name: "DeepSeek R1 8B",
    provider: "ollama",
    providerLabel: "Ollama Local",
    type: "local",
    description: "Local reasoning and step-by-step logic",
    contextWindow: "64k",
  },
  {
    id: "lmstudio:local-model",
    name: "LM Studio / vLLM",
    provider: "lmstudio",
    providerLabel: "Local OpenAI-Compatible",
    type: "local",
    description: "Connect to localhost:1234/v1 or custom local endpoint",
    contextWindow: "Custom",
  },
  {
    id: "anthropic:claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    providerLabel: "Anthropic Cloud",
    type: "cloud",
    description: "Industry-leading reasoning and tool-use precision",
    contextWindow: "200k",
  },
  {
    id: "openai:gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    providerLabel: "OpenAI Cloud",
    type: "cloud",
    description: "High speed multimodal flagship model",
    contextWindow: "128k",
  },
  {
    id: "google:gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    providerLabel: "Google Cloud",
    type: "cloud",
    description: "Ultra-fast response latency with high context",
    contextWindow: "1M",
  },
];

interface ModelSelectorProps {
  selectedModelId?: string;
  onModelSelect?: (model: ModelOption) => void;
  className?: string;
}

export function ModelSelector({
  selectedModelId = "ollama:llama3.2",
  onModelSelect,
  className,
}: ModelSelectorProps) {
  const [selectedId, setSelectedId] = useState(selectedModelId);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentModel =
    AVAILABLE_MODELS.find((m) => m.id === selectedId) || AVAILABLE_MODELS[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (model: ModelOption) => {
    setSelectedId(model.id);
    onModelSelect?.(model);
    setIsOpen(false);
  };

  const getProviderIcon = (provider: ModelOption["provider"]) => {
    switch (provider) {
      case "ollama":
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
      case "lmstudio":
        return <Server className="w-3.5 h-3.5 text-cyan-400" />;
      case "anthropic":
        return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
      case "openai":
        return <Cpu className="w-3.5 h-3.5 text-indigo-400" />;
      case "google":
        return <Cloud className="w-3.5 h-3.5 text-blue-400" />;
      default:
        return <Cpu className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div className={cn("relative inline-block text-left", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {getProviderIcon(currentModel.provider)}
        <span className="font-semibold text-zinc-100">{currentModel.name}</span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wider",
            currentModel.type === "local"
              ? "bg-emerald-950/70 text-emerald-400 border border-emerald-800/50"
              : "bg-indigo-950/70 text-indigo-400 border border-indigo-800/50"
          )}
        >
          {currentModel.type}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-zinc-400 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-zinc-800/80 bg-zinc-950/40">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Select Inference Model
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto py-1 divide-y divide-zinc-800/40">
            {/* Local Models Section */}
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase text-emerald-400/80 flex items-center gap-1.5">
                <Terminal className="w-3 h-3" />
                <span>Local Models (Ollama & LM Studio)</span>
              </div>
              {AVAILABLE_MODELS.filter((m) => m.type === "local").map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-start justify-between gap-2 hover:bg-zinc-800/60 transition-colors",
                    model.id === selectedId && "bg-zinc-800/90 text-zinc-100"
                  )}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getProviderIcon(model.provider)}
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {model.name}
                      </span>
                      {model.contextWindow && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          [{model.contextWindow}]
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight">
                      {model.description}
                    </p>
                  </div>
                  {model.id === selectedId && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>

            {/* Cloud Models Section */}
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase text-indigo-400/80 flex items-center gap-1.5">
                <Cloud className="w-3 h-3" />
                <span>Cloud API Models</span>
              </div>
              {AVAILABLE_MODELS.filter((m) => m.type === "cloud").map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-start justify-between gap-2 hover:bg-zinc-800/60 transition-colors",
                    model.id === selectedId && "bg-zinc-800/90 text-zinc-100"
                  )}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getProviderIcon(model.provider)}
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {model.name}
                      </span>
                      {model.contextWindow && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          [{model.contextWindow}]
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight">
                      {model.description}
                    </p>
                  </div>
                  {model.id === selectedId && (
                    <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
