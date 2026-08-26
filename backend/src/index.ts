import dotenv from "dotenv";

dotenv.config();

export interface AgentServerConfig {
  port: number;
  ollamaBaseUrl: string;
  lmStudioBaseUrl: string;
}

export const serverConfig: AgentServerConfig = {
  port: parseInt(process.env.PORT || "4000", 10),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1",
};

console.log("Developer Assistant Agent Backend Engine initialized.");
console.log(`Port: ${serverConfig.port}`);
console.log(`Ollama Endpoint: ${serverConfig.ollamaBaseUrl}`);
