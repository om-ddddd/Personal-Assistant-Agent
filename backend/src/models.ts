import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

// Always load .env from the backend directory regardless of cwd
dotenv.config({ path: path.join(backendDir, ".env") });

export interface ModelInfo {
  id: string;
  name: string;
  provider: "ollama" | "groq" | "nvidia" | "openai" | "anthropic" | "google";
  providerLabel: string;
  type: "local" | "cloud";
  description: string;
  contextWindow?: string;
  parameterSize?: string;
  sizeBytes?: number;
  supportsTools?: boolean;
  isConfigured: boolean;
  isDefault?: boolean;
}

export interface OllamaModelTag {
  name: string;
  model: string;
  size: number;
  digest?: string;
  modified_at?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
    context_length?: number;
  };
  capabilities?: string[];
}

export interface OllamaStatus {
  isOnline: boolean;
  baseUrl: string;
  version?: string;
  models: OllamaModelTag[];
  error?: string;
}

export interface ModelOptions {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export interface UserLlmKeyOverrides {
  groqApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  nvidiaApiKey?: string;
  nvidiaBaseUrl?: string;
  ollamaBaseUrl?: string;
}

export const OLLAMA_DEFAULT_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// Cache instantiated models
const modelCache = new Map<string, BaseChatModel>();

/**
 * Format bytes to human readable format (e.g. 4.9 GB)
 */
function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * Check if the local Ollama instance is reachable and query all installed models.
 */
export async function checkOllamaHealth(
  baseUrl: string = OLLAMA_DEFAULT_BASE_URL
): Promise<OllamaStatus> {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${cleanBase}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        isOnline: false,
        baseUrl: cleanBase,
        models: [],
        error: `Ollama returned HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = (await res.json()) as { models?: OllamaModelTag[] };
    return {
      isOnline: true,
      baseUrl: cleanBase,
      models: data.models || [],
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const error = err as Error;
    return {
      isOnline: false,
      baseUrl: cleanBase,
      models: [],
      error: error.message || `Could not connect to Ollama on ${cleanBase}`,
    };
  }
}

/**
 * Trigger an Ollama model pull directly from Ollama API.
 */
export async function pullOllamaModel(
  modelName: string,
  baseUrl: string = OLLAMA_DEFAULT_BASE_URL
): Promise<{ success: boolean; message: string }> {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanModel = modelName.trim().replace(/^ollama[:\/]/, "");

  try {
    const res = await fetch(`${cleanBase}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: cleanModel,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        message: `Ollama pull failed (HTTP ${res.status}): ${errText}`,
      };
    }

    // Invalidate cache
    modelCache.clear();

    return {
      success: true,
      message: `Successfully pulled model "${cleanModel}" into Ollama.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || `Failed to pull model "${cleanModel}".`,
    };
  }
}

/**
 * Dynamically list all available models:
 * 1. Local Offline Models (Ollama auto-detected)
 * 2. Cloud Providers (Groq, OpenAI, Anthropic, Google Gemini, NVIDIA NIM) with isConfigured status
 */
export async function listAllAvailableModels(
  userKeys?: UserLlmKeyOverrides
): Promise<{
  models: ModelInfo[];
  defaultModelId: string;
  ollamaStatus: OllamaStatus;
}> {
  const ollamaBaseUrl = userKeys?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL;
  const ollamaStatus = await checkOllamaHealth(ollamaBaseUrl);
  const models: ModelInfo[] = [];

  // 1. LOCAL OLLAMA MODELS (Offline Support)
  if (ollamaStatus.isOnline && ollamaStatus.models.length > 0) {
    for (const m of ollamaStatus.models) {
      const paramSize = m.details?.parameter_size || "";
      const sizeStr = formatBytes(m.size);
      const caps = m.capabilities || [];
      const hasTools =
        caps.includes("tools") ||
        m.name.toLowerCase().includes("qwen") ||
        m.name.toLowerCase().includes("llama3") ||
        m.name.toLowerCase().includes("mistral");

      const contextLength = m.details?.context_length
        ? `${Math.round(m.details.context_length / 1024)}k`
        : m.name.includes("deepseek-r1")
        ? "128k"
        : m.name.includes("qwen")
        ? "40k"
        : "32k";

      models.push({
        id: `ollama:${m.name}`,
        name: m.name,
        provider: "ollama",
        providerLabel: "Ollama (Offline/Local)",
        type: "local",
        description: `Local model (${paramSize || "LLM"}${sizeStr ? " • " + sizeStr : ""})`,
        parameterSize: paramSize,
        sizeBytes: m.size,
        contextWindow: contextLength,
        supportsTools: hasTools,
        isConfigured: true,
      });
    }
  } else {
    // If Ollama is offline or has no installed models, provide placeholder
    models.push({
      id: "ollama:qwen3:8b",
      name: "qwen3:8b",
      provider: "ollama",
      providerLabel: "Ollama (Offline/Local)",
      type: "local",
      description: ollamaStatus.isOnline
        ? "Not installed yet. Pull with: ollama pull qwen3:8b"
        : "Ollama is offline. Start Ollama on your machine",
      parameterSize: "8.2B",
      contextWindow: "40k",
      supportsTools: true,
      isConfigured: ollamaStatus.isOnline,
    });
    models.push({
      id: "ollama:deepseek-r1:8b",
      name: "deepseek-r1:8b",
      provider: "ollama",
      providerLabel: "Ollama (Offline/Local)",
      type: "local",
      description: ollamaStatus.isOnline
        ? "Not installed yet. Pull with: ollama pull deepseek-r1:8b"
        : "Ollama is offline. Start Ollama on your machine",
      parameterSize: "8.2B",
      contextWindow: "128k",
      supportsTools: false,
      isConfigured: ollamaStatus.isOnline,
    });
  }

  // 2. CLOUD API PROVIDERS
  const hasGroq = !!userKeys?.groqApiKey || !!process.env.GROQ_API_KEY;
  const hasOpenAi = !!userKeys?.openaiApiKey || !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!userKeys?.anthropicApiKey || !!process.env.ANTHROPIC_API_KEY;
  const hasGoogle = !!userKeys?.googleApiKey || !!process.env.GOOGLE_GENAI_API_KEY;
  const hasNvidia = !!userKeys?.nvidiaApiKey || !!process.env.NVIDIA_API_KEY;

  // Groq Models
  models.push({
    id: "groq:openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "groq",
    providerLabel: "Groq Cloud (Fast)",
    type: "cloud",
    description: "High speed open-weights model inference on LPUs",
    contextWindow: "128k",
    supportsTools: true,
    isConfigured: hasGroq,
  });
  models.push({
    id: "groq:llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    provider: "groq",
    providerLabel: "Groq Cloud",
    type: "cloud",
    description: "Versatile, high-precision open model with tool calling",
    contextWindow: "128k",
    supportsTools: true,
    isConfigured: hasGroq,
  });

  // Anthropic Claude Models
  models.push({
    id: "anthropic:claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    providerLabel: "Anthropic Claude",
    type: "cloud",
    description: "Industry-leading reasoning and tool precision",
    contextWindow: "200k",
    supportsTools: true,
    isConfigured: hasAnthropic,
  });
  models.push({
    id: "anthropic:claude-3-5-haiku-latest",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    providerLabel: "Anthropic Claude",
    type: "cloud",
    description: "Rapid reasoning and low latency",
    contextWindow: "200k",
    supportsTools: true,
    isConfigured: hasAnthropic,
  });

  // OpenAI Models
  models.push({
    id: "openai:gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    providerLabel: "OpenAI Cloud",
    type: "cloud",
    description: "Flagship multimodal intelligence with high speed",
    contextWindow: "128k",
    supportsTools: true,
    isConfigured: hasOpenAi,
  });
  models.push({
    id: "openai:gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    providerLabel: "OpenAI Cloud",
    type: "cloud",
    description: "Fast, lightweight model for everyday development tasks",
    contextWindow: "128k",
    supportsTools: true,
    isConfigured: hasOpenAi,
  });

  // Google Gemini Models
  models.push({
    id: "google:gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    providerLabel: "Google Cloud",
    type: "cloud",
    description: "Ultra-fast response with high reasoning context",
    contextWindow: "1M",
    supportsTools: true,
    isConfigured: hasGoogle,
  });

  // NVIDIA NIM Models
  models.push({
    id: "nvidia:nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super 120B",
    provider: "nvidia",
    providerLabel: "NVIDIA NIM",
    type: "cloud",
    description: "High accuracy tool use and coding with deep context",
    contextWindow: "128k",
    supportsTools: true,
    isConfigured: hasNvidia,
  });

  // Determine intelligent default model ID
  let defaultModelId = "ollama:qwen3:8b";

  // Prioritize active local Ollama model if online and has models
  if (ollamaStatus.isOnline && ollamaStatus.models.length > 0) {
    const qwenModel = ollamaStatus.models.find((m) => m.name.toLowerCase().includes("qwen"));
    const firstLocal = qwenModel || ollamaStatus.models[0];
    defaultModelId = `ollama:${firstLocal.name}`;
  } else if (hasGroq) {
    defaultModelId = "groq:openai/gpt-oss-120b";
  } else if (hasNvidia) {
    defaultModelId = "nvidia:nvidia/nemotron-3-super-120b-a12b";
  } else if (hasOpenAi) {
    defaultModelId = "openai:gpt-4o";
  }

  // Set isDefault flag
  for (const m of models) {
    if (m.id === defaultModelId) {
      m.isDefault = true;
      break;
    }
  }

  return {
    models,
    defaultModelId,
    ollamaStatus,
  };
}

/**
 * Dynamic Model factory supporting local Ollama & cloud providers.
 *
 * @param modelId - Target model identifier (e.g. "ollama:qwen3:8b", "groq:openai/gpt-oss-120b", "openai:gpt-4o")
 * @param options - Runtime overrides for temperature, API key, base URL, etc.
 */
export function getModel(modelId: string = "default", options?: ModelOptions): BaseChatModel {
  const temperature = options?.temperature ?? 0.2;

  // Clean and normalize ID
  let normalizedId = modelId.trim();
  if (normalizedId === "default" || normalizedId === "") {
    normalizedId = "ollama:qwen3:8b";
  }

  // Check cache for existing instance if no specific runtime key override
  const cacheKey = `${normalizedId}:${temperature}:${options?.baseUrl || ""}`;
  if (!options?.apiKey && modelCache.has(cacheKey)) {
    return modelCache.get(cacheKey)!;
  }

  let chatModel: BaseChatModel;

  // 1. Ollama Provider (Local / Offline)
  if (normalizedId.startsWith("ollama:") || normalizedId.startsWith("ollama/")) {
    const rawName = normalizedId.replace(/^ollama[:\/]/, "").trim();
    const modelName = rawName || "qwen3:8b";
    const baseUrl = options?.baseUrl || process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL;

    chatModel = new ChatOllama({
      baseUrl,
      model: modelName,
      temperature,
    });
  }

  // 2. Groq Provider (Cloud)
  else if (normalizedId.startsWith("groq:") || normalizedId.startsWith("groq/")) {
    const rawName = normalizedId.replace(/^groq[:\/]/, "").trim();
    const modelName = rawName || process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const apiKey = options?.apiKey || process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Groq API Key is not configured. Please add your GROQ API key in your LLM Profile to use this model."
      );
    }

    chatModel = new ChatGroq({
      apiKey,
      model: modelName,
      temperature,
    });
  }

  // 3. OpenAI Provider (Cloud)
  else if (normalizedId.startsWith("openai:") || normalizedId.startsWith("openai/")) {
    const rawName = normalizedId.replace(/^openai[:\/]/, "").trim();
    const modelName = rawName || "gpt-4o";
    const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "OpenAI API Key is not configured. Please add your OpenAI API key in your LLM Profile to use this model."
      );
    }

    chatModel = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature,
    });
  }

  // 4. Anthropic Claude Provider (Cloud)
  else if (normalizedId.startsWith("anthropic:") || normalizedId.startsWith("anthropic/")) {
    const rawName = normalizedId.replace(/^anthropic[:\/]/, "").trim();
    const modelName = rawName || "claude-3-5-sonnet-latest";
    const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Anthropic Claude API Key is not configured. Please add your Anthropic key in your LLM Profile to use this model."
      );
    }

    chatModel = new ChatAnthropic({
      apiKey,
      modelName,
      temperature,
    });
  }

  // 5. Google Gemini Provider (Cloud)
  else if (normalizedId.startsWith("google:") || normalizedId.startsWith("google/")) {
    const rawName = normalizedId.replace(/^google[:\/]/, "").trim();
    const modelName = rawName || "gemini-2.0-flash";
    const apiKey = options?.apiKey || process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Google Gemini API Key is not configured. Please add your Google AI key in your LLM Profile to use this model."
      );
    }

    chatModel = new ChatGoogleGenerativeAI({
      apiKey,
      modelName,
      temperature,
    });
  }

  // 6. NVIDIA NIM Provider (Cloud)
  else if (normalizedId.startsWith("nvidia:") || normalizedId.startsWith("nvidia/")) {
    const rawName = normalizedId.replace(/^nvidia[:\/]/, "").trim();
    const modelName = rawName || process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b";
    const apiKey = options?.apiKey || process.env.NVIDIA_API_KEY;
    const baseUrl = options?.baseUrl || process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

    if (!apiKey) {
      throw new Error(
        "NVIDIA API Key is not configured. Please add your NVIDIA API key in your LLM Profile to use this model."
      );
    }

    chatModel = new ChatOpenAI({
      apiKey,
      model: modelName,
      configuration: { baseURL: baseUrl },
      temperature,
    });
  }

  // Fallback to Ollama local
  else {
    chatModel = new ChatOllama({
      baseUrl: OLLAMA_DEFAULT_BASE_URL,
      model: normalizedId.replace(/^ollama[:\/]/, "") || "qwen3:8b",
      temperature,
    });
  }

  // Cache instance if using default config
  if (!options?.apiKey) {
    modelCache.set(cacheKey, chatModel);
  }

  return chatModel;
}

/**
 * Backward compatibility export of active default model instance.
 */
export const model = getModel("default");

/**
 * Test connectivity and authentication for any LLM provider.
 */
export async function testModelConnection(
  provider: string,
  config: { apiKey?: string; baseUrl?: string; modelName?: string } = {}
): Promise<{ success: boolean; message: string; latencyMs: number; details?: any }> {
  const startTime = Date.now();
  const cleanProvider = provider.toLowerCase().trim();

  try {
    if (cleanProvider === "ollama") {
      const baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL;
      const status = await checkOllamaHealth(baseUrl);
      const latencyMs = Date.now() - startTime;
      if (!status.isOnline) {
        return {
          success: false,
          message: status.error || "Ollama is not reachable on " + baseUrl,
          latencyMs,
        };
      }
      return {
        success: true,
        message: `Ollama is connected at ${status.baseUrl} (${status.models.length} local models detected).`,
        latencyMs,
        details: {
          modelsCount: status.models.length,
          models: status.models.map((m) => m.name),
        },
      };
    }

    // Cloud Providers
    let testModel: BaseChatModel;
    if (cleanProvider === "groq") {
      const apiKey = config.apiKey || process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error("Groq API Key is missing.");
      testModel = new ChatGroq({
        model: config.modelName || "openai/gpt-oss-120b",
        apiKey,
        maxTokens: 5,
        temperature: 0,
      });
    } else if (cleanProvider === "openai") {
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API Key is missing.");
      testModel = new ChatOpenAI({
        model: config.modelName || "gpt-4o-mini",
        apiKey,
        maxTokens: 5,
        temperature: 0,
      });
    } else if (cleanProvider === "anthropic") {
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("Anthropic API Key is missing.");
      testModel = new ChatAnthropic({
        modelName: config.modelName || "claude-3-5-haiku-latest",
        apiKey,
        maxTokens: 5,
        temperature: 0,
      });
    } else if (cleanProvider === "google") {
      const apiKey = config.apiKey || process.env.GOOGLE_GENAI_API_KEY;
      if (!apiKey) throw new Error("Google Gemini API Key is missing.");
      testModel = new ChatGoogleGenerativeAI({
        modelName: config.modelName || "gemini-2.0-flash",
        apiKey,
        maxOutputTokens: 5,
        temperature: 0,
      });
    } else if (cleanProvider === "nvidia") {
      const apiKey = config.apiKey || process.env.NVIDIA_API_KEY;
      if (!apiKey) throw new Error("NVIDIA API Key is missing.");
      testModel = new ChatOpenAI({
        model: config.modelName || "nvidia/nemotron-3-super-120b-a12b",
        apiKey,
        configuration: {
          baseURL: config.baseUrl || process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
        },
        maxTokens: 5,
        temperature: 0,
      });
    } else {
      throw new Error(`Unknown provider "${provider}".`);
    }

    await testModel.invoke("ping");
    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      message: `Successfully connected to ${provider.toUpperCase()} (Latency: ${latencyMs}ms).`,
      latencyMs,
    };
  } catch (err: unknown) {
    const error = err as Error;
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      message: error.message || `Failed to connect to ${provider}.`,
      latencyMs,
    };
  }
}
