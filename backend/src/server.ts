import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { invokeAgent } from "./agent.js";

dotenv.config();

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "developer-personal-assistant-backend",
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      timestamp: new Date().toISOString(),
    });
  });

  // Chat invocation endpoint
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { message, threadId = "default-session" } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'message' field in request body." });
      }

      const result = await invokeAgent(message, threadId);
      return res.json({
        content: result.content,
        threadId,
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Chat invocation error:", error);
      return res.status(500).json({
        error: error.message || "Failed to invoke LangGraph agent.",
      });
    }
  });

  return app;
}
