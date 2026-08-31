"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronDown,
  Cpu,
  Cloud,
  Check,
  Server,
  Sparkles,
  Terminal,
  RefreshCw,
  Zap,
  AlertCircle,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  name: string;
  provider: "ollama" | "lmstudio" | "groq" | "nvidia" | "openai" | "anthropic" | "google";
  providerLabel: string;
  type: "local" | "cloud";
  description: string;
  contextWindow?: string;
  parameterSize?: string;
  sizeBytes?: number;
  supportsTools?: boolean;
  isConfigured?: boolean;
  isDefault?: boolean;
}

export const FALLBACK_MODELS: ModelOption[] = [
  {
    id: "ollama:qwen3:8b",
    name: "Qwen 3 8B",
    provider: "ollama",
    providerLabel: "Ollama Local",
    type: "local",
    description: "Local inference with tool calling & step-by-step thinking",
    contextWindow: "40k",
    parameterSize: "8.2B",
    isConfigured: true,
    isDefault: true,
  },
  {
    id: "ollama:deepseek-r1:8b",
    name: "DeepSeek R1 8B",
    provider: "ollama",
    providerLabel: "Ollama Local",
    type: "local",
    description: "Local reasoning and step-by-step logic",
    contextWindow: "64k",
    parameterSize: "8.2B",
    isConfigured: true,
  },
  {
    id: "groq:openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "groq",
    providerLabel: "Groq Cloud (Fast)",
    type: "cloud",
    description: "High speed open-weights model inference on LPUs",
    contextWindow: "128k",
    isConfigured: true,
  },
  {
    id: "nvidia:nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super 120B",
    provider: "nvidia",
    providerLabel: "NVIDIA NIM Cloud",
    type: "cloud",
    description: "High accuracy tool use and coding with deep context",
    contextWindow: "128k",
    isConfigured: true,
  },
  {
    id: "anthropic:claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    providerLabel: "Anthropic Cloud",
    type: "cloud",
    description: "Industry-leading reasoning and tool-use precision",
    contextWindow: "200k",
    isConfigured: false,
  },
  {
    id: "openai:gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    providerLabel: "OpenAI Cloud",
    type: "cloud",
    description: "High speed multimodal flagship model",
    contextWindow: "128k",
    isConfigured: false,
  },
  {
    id: "google:gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    providerLabel: "Google Cloud",
    type: "cloud",
    description: "Ultra-fast response latency with high context",
    contextWindow: "1M",
    isConfigured: false,
  },
];

export const AVAILABLE_MODELS = FALLBACK_MODELS;

interface ModelSelectorProps {
  selectedModelId?: string;
  onModelSelect?: (model: ModelOption) => void;
  onOpenKeySettings?: () => void;
  className?: string;
}

export function ModelSelector({
  selectedModelId,
  onModelSelect,
  onOpenKeySettings,
  className,
}: ModelSelectorProps) {
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [selectedId, setSelectedId] = useState<string>(
    selectedModelId || "ollama:qwen3:8b"
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchModels = useCallback(async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    setIsLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/models`, {
        headers: {
          Authorization: typeof window !== "undefined" ? `Bearer ${localStorage.getItem("assistant_auth_token") || ""}` : "",
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
          setOllamaOnline(data.ollamaStatus?.isOnline ?? false);

          // If no model was saved in localStorage or passed in props, use default
          const storedModelId = typeof window !== "undefined" ? localStorage.getItem("selected_assistant_model") : null;
          const initialId = selectedModelId || storedModelId || data.defaultModelId;
          const found = data.models.find((m: ModelOption) => m.id === initialId);
          if (found) {
            setSelectedId(found.id);
            onModelSelect?.(found);
          } else {
            setSelectedId(data.defaultModelId);
            const defaultModel = data.models.find((m: ModelOption) => m.id === data.defaultModelId);
            if (defaultModel) onModelSelect?.(defaultModel);
          }
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, [selectedModelId, onModelSelect]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (selectedModelId && selectedModelId !== selectedId) {
      setSelectedId(selectedModelId);
    }
  }, [selectedModelId, selectedId]);

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

  const currentModel =
    models.find((m) => m.id === selectedId) ||
    models.find((m) => m.id.startsWith("ollama")) ||
    models[0];

  const handleSelect = (model: ModelOption) => {
    setSelectedId(model.id);
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_assistant_model", model.id);
    }
    onModelSelect?.(model);
    setIsOpen(false);
  };

  const getProviderIcon = (provider: ModelOption["provider"]) => {
    switch (provider) {
      case "ollama":
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
      case "lmstudio":
        return <Server className="w-3.5 h-3.5 text-cyan-400" />;
      case "groq":
        return <Zap className="w-3.5 h-3.5 text-orange-400" />;
      case "nvidia":
        return <Cpu className="w-3.5 h-3.5 text-emerald-300" />;
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

  const localModels = models.filter((m) => m.type === "local");
  const cloudModels = models.filter((m) => m.type === "cloud");

  return (
    <div className={cn("relative inline-block text-left", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {getProviderIcon(currentModel.provider)}
        <span className="font-semibold text-zinc-100 truncate max-w-[140px] sm:max-w-[180px]">
          {currentModel.name}
        </span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.2 rounded uppercase font-mono tracking-wider font-semibold",
            currentModel.type === "local"
              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
              : "bg-indigo-950/80 text-indigo-400 border border-indigo-800/60"
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
        <div className="absolute right-0 mt-2 w-84 sm:w-96 rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                Select Model
              </span>
              {ollamaOnline !== null && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded font-mono font-medium flex items-center gap-1",
                    ollamaOnline
                      ? "bg-emerald-950/70 text-emerald-400 border border-emerald-800/50"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      ollamaOnline ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                    )}
                  />
                  Ollama {ollamaOnline ? "Live" : "Offline"}
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchModels();
              }}
              disabled={isLoading}
              title="Refresh installed models"
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin text-indigo-400")} />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto py-1 divide-y divide-zinc-800/50">
            {/* Local Models Section */}
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase text-emerald-400/90 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3 h-3" />
                  <span>Local Models (Ollama & LM Studio)</span>
                </div>
                <span className="text-[9px] text-zinc-500 font-sans normal-case">
                  Zero Cloud Cost
                </span>
              </div>
              {localModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-start justify-between gap-2 hover:bg-zinc-800/60 transition-colors",
                    model.id === selectedId && "bg-zinc-800/90 text-zinc-100"
                  )}
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getProviderIcon(model.provider)}
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        {model.name}
                      </span>
                      {model.parameterSize && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono border border-zinc-700/50">
                          {model.parameterSize}
                        </span>
                      )}
                      {model.contextWindow && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          [{model.contextWindow}]
                        </span>
                      )}
                      {model.supportsTools && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-300 font-mono border border-emerald-800/40">
                          tools
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight">
                      {model.description}
                    </p>
                  </div>
                  {model.id === selectedId && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>

            {/* Cloud Models Section */}
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase text-indigo-400/90 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Cloud className="w-3 h-3" />
                  <span>Cloud API Models</span>
                </div>
                <span className="text-[9px] text-zinc-500 font-sans normal-case">
                  Ultra Fast & Frontier
                </span>
              </div>
              {cloudModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={cn(
                    "w-full px-3 py-2 text-left flex items-start justify-between gap-2 hover:bg-zinc-800/60 transition-colors",
                    model.id === selectedId && "bg-zinc-800/90 text-zinc-100",
                    model.isConfigured === false && "opacity-60"
                  )}
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getProviderIcon(model.provider)}
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        {model.name}
                      </span>
                      {model.contextWindow && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          [{model.contextWindow}]
                        </span>
                      )}
                      {model.isConfigured === false && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950/60 text-amber-300 font-mono border border-amber-800/40">
                          key required
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight">
                      {model.description}
                    </p>
                  </div>
                  {model.id === selectedId && (
                    <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Dropdown Footer: Configure API Keys */}
          {onOpenKeySettings && (
            <div className="p-2 border-t border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenKeySettings();
                }}
                className="w-full py-1.5 px-2 rounded-md bg-zinc-900 hover:bg-zinc-800 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 border border-zinc-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Configure LLM Keys & Endpoints</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
