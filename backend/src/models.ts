import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import dotenv from "dotenv";

dotenv.config();

/**
 * Primary Active Model: Groq
 */
export const model = new ChatGroq({
  model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", // fast & free-tier friendly
  apiKey: process.env.GROQ_API_KEY || "gsk_placeholder_key",
  temperature: 0,
});

/**
 * Model factory supporting dynamic provider instantiation for future extensions.
 */
export function getModel(modelId: string = "groq:default"): BaseChatModel {
  if (modelId.startsWith("groq") || modelId === "default") {
    return model;
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
      model: modelName,
      temperature: 0,
    });
  }

  return model;
}
