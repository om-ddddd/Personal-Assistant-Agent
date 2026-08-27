import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  invokeAgent,
  streamAgentEvents,
  listThreads,
  createThread,
  deleteThread,
  getThreadHistory,
  getCompiledAgent,
  getActiveTools,
} from "./agent.js";
import { closeMcpClient } from "./mcp/client.js";

dotenv.config();

export function createServer() {
  const app = express();

  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  app.use(express.json());

  // Proactively initialize agent and MCP client
  getCompiledAgent().catch((err) => {
    console.error("[Server] Error initializing agent tools:", err);
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "developer-personal-assistant-backend",
      mcp: "connected",
      model: process.env.NVIDIA_MODEL || process.env.GROQ_MODEL || "nvidia/nemotron-3-super-120b-a12b",
      timestamp: new Date().toISOString(),
    });
  });

  // List all registered tools (basic + MCP)
  app.get("/api/tools", (_req: Request, res: Response) => {
    const tools = getActiveTools();
    return res.json({ tools, total: tools.length });
  });

  // List all distinct thread sessions
  app.get("/api/threads", (_req: Request, res: Response) => {
    const threads = listThreads();
    return res.json({ threads });
  });

  // Create a new distinct thread session (Backend-generated UUID)
  app.post("/api/threads", (req: Request, res: Response) => {
    const { title } = req.body || {};
    const thread = createThread(title || "New Conversation");
    return res.status(201).json({ thread });
  });

  // Delete a thread session
  app.delete("/api/threads/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const deleted = deleteThread(id);
    return res.json({ success: deleted, id });
  });

  // Retrieve message history for a specific thread
  app.get("/api/threads/:id/history", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const history = await getThreadHistory(id);
      return res.json({ threadId: id, messages: history });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to fetch thread history" });
    }
  });

  // Non-streaming chat invocation endpoint
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
        toolCallsCount: result.toolCallsCount,
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Chat invocation error:", error);
      return res.status(500).json({
        error: error.message || "Failed to invoke LangGraph agent.",
      });
    }
  });

  // Real-time SSE token streaming endpoint
  app.post("/api/chat/stream", async (req: Request, res: Response) => {
    const { message, threadId = "default-session" } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'message' field in request body." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    try {
      for await (const event of streamAgentEvents(message, threadId)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Streaming error:", error);
      res.write(`data: ${JSON.stringify({ error: error.message || "Streaming failed" })}\n\n`);
      res.end();
    }
  });

  // Handle process cleanup
  process.on("SIGINT", async () => {
    await closeMcpClient();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await closeMcpClient();
    process.exit(0);
  });

  return app;
}
