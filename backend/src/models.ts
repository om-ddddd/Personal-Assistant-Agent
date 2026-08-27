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

/**
 * Primary Active Model: NVIDIA NIM (openai/gpt-compatible endpoint) or Groq fallback
 */
export const model = process.env.NVIDIA_API_KEY
  ? new ChatOpenAI({
      model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b",
      apiKey: process.env.NVIDIA_API_KEY,
      configuration: {
        baseURL: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
      },
      temperature: 0.7,
      topP: 0.95,
      maxTokens: 16384,
    })
  : new ChatGroq({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      apiKey: process.env.GROQ_API_KEY,
      temperature: 0,
    });

/**
 * Model factory supporting dynamic provider instantiation for future extensions.
 */
export function getModel(modelId: string = "nvidia:default"): BaseChatModel {
  if (modelId.startsWith("nvidia") || modelId === "default") {
    return model;
  }

  if (modelId.startsWith("groq:")) {
    const modelName = modelId.replace("groq:", "");
    return new ChatGroq({
      model: modelName || process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      apiKey: process.env.GROQ_API_KEY,
      temperature: 0,
    });
  }

  if (modelId.startsWith("ollama:")) {
    const modelName = modelId.replace("ollama:", "");
    return new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: modelName,
      temperature: 0,
    });
  }

  if (modelId.startsWith("anthropic:")) {
    const modelName = modelId.replace("anthropic:", "");
    return new ChatAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      modelName: modelName,
      temperature: 0,
    });
  }

  if (modelId.startsWith("openai:")) {
    const modelName = modelId.replace("openai:", "");
    return new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      modelName: modelName,
      temperature: 0,
    });
  }

  if (modelId.startsWith("google:")) {
    const modelName = modelId.replace("google:", "");
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY,
      modelName: modelName,
      temperature: 0,
    });
  }

  return model;
}
