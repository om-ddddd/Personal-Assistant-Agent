"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  Terminal,
  Cpu,
  Zap,
  Sparkles,
  Cloud,
  Server,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  RotateCcw,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchLlmProfile,
  saveLlmProfile,
  resetLlmProfile,
  testProviderConnection,
  pullOllamaModelApi,
  MaskedLlmProfile,
  TestConnectionResult,
} from "@/lib/llm-profile-api";

interface LlmProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

export function LlmProfileModal({
  isOpen,
  onClose,
  onProfileUpdated,
}: LlmProfileModalProps) {
  const [profile, setProfile] = useState<MaskedLlmProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"local" | "cloud">("local");

  // Pull model state
  const [pullModelName, setPullModelName] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Form states (stores new typed values or empty string if unchanged)
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [lmstudioBaseUrl, setLmstudioBaseUrl] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [nvidiaApiKey, setNvidiaApiKey] = useState("");
  const [nvidiaBaseUrl, setNvidiaBaseUrl] = useState("");

  // Visibility toggles
  const [showGroq, setShowGroq] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const [showNvidia, setShowNvidia] = useState(false);

  // Test connection state map: provider -> result & testing status
  const [testResults, setTestResults] = useState<
    Record<string, { testing: boolean; result?: TestConnectionResult }>
  >({});

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  async function loadProfile() {
    setIsLoading(true);
    const data = await fetchLlmProfile();
    if (data) {
      setProfile(data);
      setOllamaBaseUrl(data.ollamaBaseUrl || "http://localhost:11434");
      setLmstudioBaseUrl(data.lmstudioBaseUrl || "http://localhost:1234/v1");
      setNvidiaBaseUrl(data.nvidiaBaseUrl || "");
    }
    setIsLoading(false);
  }

  async function handleTest(provider: string) {
    setTestResults((prev) => ({
      ...prev,
      [provider]: { testing: true },
    }));

    let config: { apiKey?: string; baseUrl?: string } = {};
    if (provider === "ollama") config.baseUrl = ollamaBaseUrl;
    else if (provider === "lmstudio") config.baseUrl = lmstudioBaseUrl;
    else if (provider === "groq") config.apiKey = groqApiKey || undefined;
    else if (provider === "openai") config.apiKey = openaiApiKey || undefined;
    else if (provider === "anthropic") config.apiKey = anthropicApiKey || undefined;
    else if (provider === "google") config.apiKey = googleApiKey || undefined;
    else if (provider === "nvidia") {
      config.apiKey = nvidiaApiKey || undefined;
      config.baseUrl = nvidiaBaseUrl || undefined;
    }

    const res = await testProviderConnection(provider, config);

    setTestResults((prev) => ({
      ...prev,
      [provider]: { testing: false, result: res },
    }));
  }

  async function handlePullModel() {
    if (!pullModelName.trim()) return;
    setIsPulling(true);
    setPullStatus(null);
    const res = await pullOllamaModelApi(pullModelName.trim());
    setIsPulling(false);
    setPullStatus(res);
    if (res.success) {
      setPullModelName("");
      handleTest("ollama");
      onProfileUpdated?.();
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setNotification(null);

    const payload: Record<string, string> = {};
    if (ollamaBaseUrl) payload.ollamaBaseUrl = ollamaBaseUrl;
    if (lmstudioBaseUrl) payload.lmstudioBaseUrl = lmstudioBaseUrl;
    if (groqApiKey) payload.groqApiKey = groqApiKey;
    if (openaiApiKey) payload.openaiApiKey = openaiApiKey;
    if (anthropicApiKey) payload.anthropicApiKey = anthropicApiKey;
    if (googleApiKey) payload.googleApiKey = googleApiKey;
    if (nvidiaApiKey) payload.nvidiaApiKey = nvidiaApiKey;
    if (nvidiaBaseUrl) payload.nvidiaBaseUrl = nvidiaBaseUrl;

    const res = await saveLlmProfile(payload);
    setIsSaving(false);

    if (res.success) {
      setNotification({
        type: "success",
        message: "LLM profile keys updated successfully.",
      });
      if (res.keys) {
        setProfile(res.keys);
      }
      // Clear typed raw key inputs after saving
      setGroqApiKey("");
      setOpenaiApiKey("");
      setAnthropicApiKey("");
      setGoogleApiKey("");
      setNvidiaApiKey("");
      onProfileUpdated?.();
    } else {
      setNotification({
        type: "error",
        message: res.message || "Failed to update LLM profile keys.",
      });
    }
  }

  async function handleReset() {
    if (!confirm("Are you sure you want to clear your custom LLM keys and revert to server environment defaults?")) {
      return;
    }
    setIsSaving(true);
    const res = await resetLlmProfile();
    setIsSaving(false);
    if (res.success) {
      setNotification({
        type: "success",
        message: "LLM profile reverted to system defaults.",
      });
      if (res.keys) setProfile(res.keys);
      setGroqApiKey("");
      setOpenaiApiKey("");
      setAnthropicApiKey("");
      setGoogleApiKey("");
      setNvidiaApiKey("");
      onProfileUpdated?.();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50 duration-150">
      <div className="w-full max-w-2xl rounded-xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-950/80 border border-indigo-800/60 text-indigo-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">LLM Profile & Provider Keys</h2>
              <p className="text-xs text-zinc-400">
                Configure your custom local inference endpoints and cloud API keys.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 pb-0 border-b border-zinc-800 flex items-center gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("local")}
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition-all",
              activeTab === "local"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Local Inference (Ollama & LM Studio)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cloud")}
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition-all",
              activeTab === "cloud"
                ? "border-indigo-500 text-indigo-400 font-bold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Cloud API Keys</span>
          </button>
        </div>

        {/* Notifications */}
        {notification && (
          <div
            className={cn(
              "mx-6 mt-4 p-3 rounded-lg text-xs flex items-center justify-between border",
              notification.type === "success"
                ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                : "bg-rose-950/60 border-rose-800 text-rose-300"
            )}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-black/20 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-500 text-xs font-mono">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Loading LLM profile keys...</span>
            </div>
          ) : activeTab === "local" ? (
            /* LOCAL INFERENCE TAB */
            <div className="space-y-6">
              {/* Ollama Section */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-zinc-200">Local Ollama</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-mono font-medium">
                    Auto-Discovered
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Run privacy-preserving models directly on your hardware (CPU, NVIDIA GPU, or Apple Silicon).
                </p>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-zinc-300">Ollama Base URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ollamaBaseUrl}
                      onChange={(e) => setOllamaBaseUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleTest("ollama")}
                      disabled={testResults.ollama?.testing}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {testResults.ollama?.testing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>Test & Discover</span>
                    </button>
                  </div>
                  {testResults.ollama?.result && (
                    <div
                      className={cn(
                        "mt-2 p-2.5 rounded-lg text-[11px] font-mono border",
                        testResults.ollama.result.success
                          ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                          : "bg-rose-950/40 border-rose-800/60 text-rose-300"
                      )}
                    >
                      {testResults.ollama.result.message}
                      {testResults.ollama.result.details?.models && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {testResults.ollama.result.details.models.map((m: string) => (
                            <span
                              key={m}
                              className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[10px] text-emerald-300 font-mono"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pull New Model */}
                  <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
                    <label className="text-[11px] font-medium text-zinc-300">Pull New Ollama Model</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={pullModelName}
                        onChange={(e) => setPullModelName(e.target.value)}
                        placeholder="e.g. llama3.2, mistral, deepseek-r1:8b"
                        className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handlePullModel}
                        disabled={isPulling || !pullModelName.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isPulling ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Pulling...</span>
                          </>
                        ) : (
                          <span>Pull Model</span>
                        )}
                      </button>
                    </div>
                    {pullStatus && (
                      <p
                        className={cn(
                          "text-[11px] font-mono",
                          pullStatus.success ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {pullStatus.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* LM Studio / vLLM Section */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-zinc-200">LM Studio / vLLM</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-mono font-medium">
                    OpenAI Compatible
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Connect to local OpenAI-compatible endpoints served by LM Studio or vLLM.
                </p>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-zinc-300">Endpoint Base URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={lmstudioBaseUrl}
                      onChange={(e) => setLmstudioBaseUrl(e.target.value)}
                      placeholder="http://localhost:1234/v1"
                      className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleTest("lmstudio")}
                      disabled={testResults.lmstudio?.testing}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {testResults.lmstudio?.testing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                      <span>Test</span>
                    </button>
                  </div>
                  {testResults.lmstudio?.result && (
                    <div
                      className={cn(
                        "mt-2 p-2.5 rounded-lg text-[11px] font-mono border",
                        testResults.lmstudio.result.success
                          ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                          : "bg-rose-950/40 border-rose-800/60 text-rose-300"
                      )}
                    >
                      {testResults.lmstudio.result.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* CLOUD API KEYS TAB */
            <div className="space-y-4">
              {/* Groq Key */}
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-zinc-200">Groq API Key</span>
                  </div>
                  {profile?.hasGroq && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                      Configured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showGroq ? "text" : "password"}
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                      placeholder={profile?.groqApiKey || "gsk_..."}
                      className="w-full pl-3 pr-8 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGroq(!showGroq)}
                      className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showGroq ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTest("groq")}
                    disabled={testResults.groq?.testing}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  >
                    {testResults.groq?.testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
                  </button>
                </div>
                {testResults.groq?.result && (
                  <p className={cn("text-[11px] font-mono", testResults.groq.result.success ? "text-emerald-400" : "text-rose-400")}>
                    {testResults.groq.result.message}
                  </p>
                )}
              </div>

              {/* OpenAI Key */}
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-zinc-200">OpenAI API Key</span>
                  </div>
                  {profile?.hasOpenai && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                      Configured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showOpenai ? "text" : "password"}
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder={profile?.openaiApiKey || "sk-..."}
                      className="w-full pl-3 pr-8 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenai(!showOpenai)}
                      className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showOpenai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTest("openai")}
                    disabled={testResults.openai?.testing}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  >
                    {testResults.openai?.testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
                  </button>
                </div>
                {testResults.openai?.result && (
                  <p className={cn("text-[11px] font-mono", testResults.openai.result.success ? "text-emerald-400" : "text-rose-400")}>
                    {testResults.openai.result.message}
                  </p>
                )}
              </div>

              {/* Anthropic Key */}
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-zinc-200">Anthropic Claude API Key</span>
                  </div>
                  {profile?.hasAnthropic && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                      Configured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showAnthropic ? "text" : "password"}
                      value={anthropicApiKey}
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
                      placeholder={profile?.anthropicApiKey || "sk-ant-..."}
                      className="w-full pl-3 pr-8 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAnthropic(!showAnthropic)}
                      className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showAnthropic ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTest("anthropic")}
                    disabled={testResults.anthropic?.testing}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  >
                    {testResults.anthropic?.testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
                  </button>
                </div>
                {testResults.anthropic?.result && (
                  <p className={cn("text-[11px] font-mono", testResults.anthropic.result.success ? "text-emerald-400" : "text-rose-400")}>
                    {testResults.anthropic.result.message}
                  </p>
                )}
              </div>

              {/* Google Gemini Key */}
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-zinc-200">Google Gemini API Key</span>
                  </div>
                  {profile?.hasGoogle && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                      Configured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showGoogle ? "text" : "password"}
                      value={googleApiKey}
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                      placeholder={profile?.googleApiKey || "AIza..."}
                      className="w-full pl-3 pr-8 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGoogle(!showGoogle)}
                      className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showGoogle ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTest("google")}
                    disabled={testResults.google?.testing}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  >
                    {testResults.google?.testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
                  </button>
                </div>
                {testResults.google?.result && (
                  <p className={cn("text-[11px] font-mono", testResults.google.result.success ? "text-emerald-400" : "text-rose-400")}>
                    {testResults.google.result.message}
                  </p>
                )}
              </div>

              {/* NVIDIA NIM Key */}
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-300" />
                    <span className="text-xs font-bold text-zinc-200">NVIDIA NIM API Key & Base URL</span>
                  </div>
                  {profile?.hasNvidia && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                      Configured
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type={showNvidia ? "text" : "password"}
                      value={nvidiaApiKey}
                      onChange={(e) => setNvidiaApiKey(e.target.value)}
                      placeholder={profile?.nvidiaApiKey || "nvapi-..."}
                      className="w-full pl-3 pr-8 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNvidia(!showNvidia)}
                      className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showNvidia ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={nvidiaBaseUrl}
                    onChange={(e) => setNvidiaBaseUrl(e.target.value)}
                    placeholder="https://integrate.api.nvidia.com/v1"
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTest("nvidia")}
                    disabled={testResults.nvidia?.testing}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  >
                    {testResults.nvidia?.testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test NVIDIA"}
                  </button>
                </div>
                {testResults.nvidia?.result && (
                  <p className={cn("text-[11px] font-mono", testResults.nvidia.result.success ? "text-emerald-400" : "text-rose-400")}>
                    {testResults.nvidia.result.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Server Defaults</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/60 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
