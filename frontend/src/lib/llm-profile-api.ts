import { getStoredAuthToken } from "./user-auth";

export interface UserLlmKeys {
  groqApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  nvidiaApiKey?: string;
  nvidiaBaseUrl?: string;
  ollamaBaseUrl?: string;
  lmstudioBaseUrl?: string;
  defaultModelId?: string;
}

export interface MaskedLlmProfile {
  groqApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  nvidiaApiKey?: string;
  nvidiaBaseUrl?: string;
  ollamaBaseUrl?: string;
  lmstudioBaseUrl?: string;
  defaultModelId?: string;
  hasGroq: boolean;
  hasOpenai: boolean;
  hasAnthropic: boolean;
  hasGoogle: boolean;
  hasNvidia: boolean;
  serverDefaults: {
    hasGroq: boolean;
    hasOpenai: boolean;
    hasAnthropic: boolean;
    hasGoogle: boolean;
    hasNvidia: boolean;
    ollamaBaseUrl: string;
    lmstudioBaseUrl: string;
  };
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs: number;
  details?: any;
}

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch the user's masked LLM profile and provider configuration status.
 */
export async function fetchLlmProfile(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<MaskedLlmProfile | null> {
  try {
    const res = await fetch(`${backendUrl}/api/settings/llm-keys`, {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch LLM profile:", err);
    return null;
  }
}

/**
 * Save updated custom LLM keys to user profile.
 */
export async function saveLlmProfile(
  keys: Partial<UserLlmKeys>,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<{ success: boolean; message: string; keys?: MaskedLlmProfile; error?: string }> {
  try {
    const res = await fetch(`${backendUrl}/api/settings/llm-keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(keys),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.error || "Failed to save profile.", error: data.error };
    }
    return data;
  } catch (err: any) {
    return { success: false, message: err.message || "Network error.", error: err.message };
  }
}

/**
 * Reset LLM profile to server defaults.
 */
export async function resetLlmProfile(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<{ success: boolean; message: string; keys?: MaskedLlmProfile; error?: string }> {
  try {
    const res = await fetch(`${backendUrl}/api/settings/llm-keys`, {
      method: "DELETE",
      headers: {
        ...getAuthHeaders(),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.error || "Failed to reset profile.", error: data.error };
    }
    return data;
  } catch (err: any) {
    return { success: false, message: err.message || "Network error.", error: err.message };
  }
}

/**
 * Test connectivity and auth for a specific LLM provider.
 */
export async function testProviderConnection(
  provider: string,
  config: { apiKey?: string; baseUrl?: string; modelName?: string } = {},
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<TestConnectionResult> {
  try {
    const res = await fetch(`${backendUrl}/api/settings/llm-keys/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        provider,
        ...config,
      }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || `Failed to test ${provider}.`,
      latencyMs: 0,
    };
  }
}

/**
 * Trigger an Ollama model download/pull directly.
 */
export async function pullOllamaModelApi(
  modelName: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${backendUrl}/api/models/ollama/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ model: modelName }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || `Failed to pull model "${modelName}".`,
    };
  }
}
