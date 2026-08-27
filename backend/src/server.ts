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
import {
  getGoogleOAuthUrl,
  handleGoogleOAuthCallback,
  getGoogleAuthStatus,
} from "./tools/google-workspace.js";

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
      googleWorkspace: getGoogleAuthStatus().mode,
      model: process.env.NVIDIA_MODEL || process.env.GROQ_MODEL || "nvidia/nemotron-3-super-120b-a12b",
      timestamp: new Date().toISOString(),
    });
  });

  // Google Workspace OAuth endpoints
  app.get("/api/auth/google/status", (_req: Request, res: Response) => {
    return res.json(getGoogleAuthStatus());
  });

  app.get("/api/auth/google/url", async (_req: Request, res: Response) => {
    try {
      const url = await getGoogleOAuthUrl();
      if (!url) {
        return res.status(400).json({
          error: "Google OAuth credentials not configured in backend/.env. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google Workspace login.",
        });
      }
      return res.json({ url });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to generate OAuth URL" });
    }
  });

  // Direct 1-click browser login redirect
  app.get("/api/auth/google/login", async (_req: Request, res: Response) => {
    try {
      const url = await getGoogleOAuthUrl();
      if (!url) {
        return res.status(400).send("Google OAuth credentials not configured in backend/.env.");
      }
      return res.redirect(url);
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).send(`Failed to initiate Google login: ${error.message}`);
    }
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send("Missing OAuth authorization code in query.");
    }

    try {
      await handleGoogleOAuthCallback(code);
      return res.send(`
        <html>
          <body style="font-family: sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; padding: 2rem; border: 1px solid #27272a; border-radius: 12px; background: #18181b;">
              <h2 style="color: #10b981; margin-bottom: 0.5rem;">Google Workspace Connected Successfully</h2>
              <p style="color: #a1a1aa; font-size: 14px;">Your Personal Assistant Agent can now manage your Google Calendar and Gmail.</p>
              <button onclick="window.close()" style="margin-top: 1rem; padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).send(`OAuth authorization failed: ${error.message}`);
    }
  });

  // List all registered tools (basic + Google Workspace + MCP)
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
