import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  invokeAgent,
  streamAgentEvents,
  resumeAfterConfirmation,
  streamResumeEvents,
  getThreadInterruptState,
  listThreads,
  createThread,
  deleteThread,
  getThread,
  getThreadHistory,
  getCompiledAgent,
  getActiveTools,
} from "./agent.js";
import { closeMcpClient } from "./mcp/client.js";
import {
  getGoogleOAuthUrl,
  handleGoogleOAuthCallback,
  getGoogleAuthStatus,
  clearStoredGoogleTokens,
} from "./tools/google-workspace.js";

// Permission system imports
import { checkPermission, listRegisteredTools, getRegistrySummary } from "./permissions/registry.js";
import {
  listPendingConfirmations,
  getPendingConfirmation,
  resolvePendingConfirmation,
  cleanupExpiredConfirmations,
} from "./permissions/manager.js";

// Long-Term Memory imports
import {
  saveLongTermMemory,
  searchRelevantMemories,
  listAllMemories,
  deleteMemory as deleteLongTermMemory,
} from "./memory/long-term.js";

// GitHub OAuth imports
import {
  getGitHubOAuthUrl,
  exchangeGitHubCode,
  getGitHubAuthStatus,
  clearStoredGitHubTokens,
} from "./auth/github-oauth.js";

// User Authentication imports
import {
  signUpUser,
  loginUser,
  verifyAuthToken,
  getUserById,
} from "./auth/user-auth.js";

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

  // Periodic cleanup of expired pending confirmations (every 60 seconds)
  setInterval(() => {
    cleanupExpiredConfirmations();
  }, 60_000);

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

  // =========================================================================
  //                        PERMISSION ENDPOINTS
  // =========================================================================

  /**
   * GET /api/permissions/registry
   * Returns all registered tools and their risk classifications.
   */
  app.get("/api/permissions/registry", (_req: Request, res: Response) => {
    const tools = listRegisteredTools();
    const summary = getRegistrySummary();
    return res.json({
      tools,
      summary,
      total: tools.length,
    });
  });

  /**
   * GET /api/permissions/check/:toolName
   * Check the permission decision for a specific tool.
   */
  app.get("/api/permissions/check/:toolName", (req: Request, res: Response) => {
    const toolName = String(req.params.toolName);
    const decision = checkPermission(toolName);
    return res.json(decision);
  });

  /**
   * GET /api/permissions/pending
   * Lists all pending HITL confirmations, optionally filtered by threadId.
   */
  app.get("/api/permissions/pending", (req: Request, res: Response) => {
    const threadId = req.query.threadId as string | undefined;
    const pending = listPendingConfirmations(threadId);
    return res.json({ pending, total: pending.length });
  });

  /**
   * GET /api/permissions/pending/:id
   * Get details of a specific pending confirmation.
   */
  app.get("/api/permissions/pending/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const confirmation = getPendingConfirmation(id);
    if (!confirmation) {
      return res.status(404).json({ error: `Pending confirmation "${id}" not found.` });
    }
    return res.json(confirmation);
  });

  /**
   * POST /api/permissions/confirm/:threadId
   * Approve or reject a pending tool execution and resume the graph.
   * Body: { approved: boolean }
   * This resumes the LangGraph interrupt with the user's decision.
   */
  app.post("/api/permissions/confirm/:threadId", async (req: Request, res: Response) => {
    const threadId = String(req.params.threadId);
    const { approved } = req.body;

    if (typeof approved !== "boolean") {
      return res.status(400).json({
        error: "Request body must include 'approved' as a boolean (true/false).",
      });
    }

    try {
      // Check if thread is actually interrupted
      const interruptState = await getThreadInterruptState(threadId);
      if (!interruptState) {
        return res.status(400).json({
          error: `Thread "${threadId}" is not currently waiting for confirmation.`,
        });
      }

      const result = await resumeAfterConfirmation(threadId, approved);
      return res.json({
        threadId,
        approved,
        content: result.content,
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Server] Error resuming after confirmation:", error);
      return res.status(500).json({
        error: error.message || "Failed to resume after confirmation.",
      });
    }
  });

  /**
   * POST /api/permissions/confirm/:threadId/stream
   * Same as confirm, but returns SSE stream of the resumed execution.
   */
  app.post("/api/permissions/confirm/:threadId/stream", async (req: Request, res: Response) => {
    const threadId = String(req.params.threadId);
    const { approved } = req.body;

    if (typeof approved !== "boolean") {
      return res.status(400).json({
        error: "Request body must include 'approved' as a boolean (true/false).",
      });
    }

    // Check if thread is actually interrupted
    const interruptState = await getThreadInterruptState(threadId);
    if (!interruptState) {
      return res.status(400).json({
        error: `Thread "${threadId}" is not currently waiting for confirmation.`,
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    try {
      // Emit the decision event first
      res.write(
        `data: ${JSON.stringify({
          type: "confirmation_resolved",
          threadId,
          approved,
        })}\n\n`
      );

      for await (const event of streamResumeEvents(threadId, approved)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Server] Streaming resume error:", error);
      res.write(`data: ${JSON.stringify({ error: error.message || "Resume streaming failed" })}\n\n`);
      res.end();
    }
  });

  /**
   * GET /api/threads/:id/interrupt
   * Check if a thread is currently interrupted and return the interrupt payload.
   */
  app.get("/api/threads/:id/interrupt", async (req: Request, res: Response) => {
    try {
      const threadId = String(req.params.id);
      const interruptState = await getThreadInterruptState(threadId);
      return res.json({
        threadId,
        interrupted: !!interruptState,
        payload: interruptState,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to check interrupt state" });
    }
  });

  // =========================================================================
  //                          THREAD ENDPOINTS
  // =========================================================================

  // List all distinct thread sessions
  app.get("/api/threads", async (_req: Request, res: Response) => {
    const threads = await listThreads();
    return res.json({ threads });
  });

  // Get specific thread details (including short-term memory summary)
  app.get("/api/threads/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const thread = await getThread(id);
    if (!thread) {
      return res.status(404).json({ error: `Thread "${id}" not found.` });
    }
    return res.json({ thread });
  });

  // Create a new distinct thread session (Backend-generated UUID)
  app.post("/api/threads", (req: Request, res: Response) => {
    const { title } = req.body || {};
    const thread = createThread(title || "New Conversation");
    return res.status(201).json({ thread });
  });

  // Delete a thread session
  app.delete("/api/threads/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const deleted = await deleteThread(id);
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

  // =========================================================================
  //                      LONG-TERM MEMORY (PGVECTOR) ENDPOINTS
  // =========================================================================

  // List all durable memories
  app.get("/api/memories", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "default_user");
      const memories = await listAllMemories(userId);
      return res.json({ memories });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to list memories" });
    }
  });

  // Save a new long-term memory
  app.post("/api/memories", async (req: Request, res: Response) => {
    try {
      const { content, category = "preference", userId = "default_user" } = req.body || {};
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'content' field." });
      }
      const memory = await saveLongTermMemory(content, category, userId);
      return res.status(201).json({ memory });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to save memory" });
    }
  });

  // Delete a specific memory
  app.delete("/api/memories/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const deleted = await deleteLongTermMemory(id);
      return res.json({ success: deleted, id });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to delete memory" });
    }
  });

  // Semantic similarity search across memories
  app.post("/api/memories/search", async (req: Request, res: Response) => {
    try {
      const { query, limit = 5, threshold = 0.35, userId = "default_user" } = req.body || {};
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'query' field." });
      }
      const results = await searchRelevantMemories(query, Number(limit), Number(threshold), userId);
      return res.json({ query, results });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to search memories" });
    }
  });

  // =========================================================================
  //                       USER AUTHENTICATION ENDPOINTS
  // =========================================================================

  // Sign up new user
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      const result = await signUpUser(email, password, name);
      return res.status(201).json(result);
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(400).json({ error: error.message || "Failed to sign up." });
    }
  });

  // Log in existing user
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await loginUser(email, password);
      return res.json(result);
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(401).json({ error: error.message || "Failed to log in." });
    }
  });

  // Get current user profile from Bearer token
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "No authentication token provided." });
      }

      const decoded = verifyAuthToken(authHeader);
      const user = await getUserById(decoded.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      return res.json({ user });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(401).json({ error: error.message || "Invalid token." });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    return res.json({ success: true, message: "Logged out successfully." });
  });

  // =========================================================================
  //                       GITHUB OAUTH ENDPOINTS
  // =========================================================================

  // Generate GitHub OAuth authorization URL
  app.get("/api/auth/github/url", (req: Request, res: Response) => {
    const state = String(req.query.state || "github_auth_state");
    const url = getGitHubOAuthUrl(state);
    return res.json({
      url,
      configured: !!process.env.GITHUB_CLIENT_ID,
      redirectUri: process.env.GITHUB_REDIRECT_URI || "http://localhost:5000/api/auth/github/callback",
    });
  });

  // OAuth callback handler
  app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
    const code = String(req.query.code || "");
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (!code) {
      return res.status(400).redirect(`${frontendUrl}?github_auth=error&message=Missing_authorization_code`);
    }

    try {
      const tokens = await exchangeGitHubCode(code);
      return res.redirect(`${frontendUrl}?github_auth=success&username=${tokens.user?.login || ""}`);
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[GitHubOAuth] Error exchanging code:", error);
      return res.redirect(`${frontendUrl}?github_auth=error&message=${encodeURIComponent(error.message)}`);
    }
  });

  // Get current GitHub connection status
  app.get("/api/auth/github/status", async (_req: Request, res: Response) => {
    try {
      const status = await getGitHubAuthStatus();
      return res.json(status);
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to check GitHub auth status" });
    }
  });

  // Disconnect GitHub OAuth tokens
  app.post("/api/auth/github/disconnect", (_req: Request, res: Response) => {
    const success = clearStoredGitHubTokens();
    return res.json({ success, message: "GitHub disconnected." });
  });

  // =========================================================================
  //                       GOOGLE OAUTH ENDPOINTS
  // =========================================================================

  // Generate Google OAuth authorization URL
  app.get("/api/auth/google/url", async (_req: Request, res: Response) => {
    try {
      const url = await getGoogleOAuthUrl();
      return res.json({
        url,
        configured: !!process.env.GOOGLE_CLIENT_ID,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback",
      });
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to generate Google OAuth URL" });
    }
  });

  // Google OAuth callback handler
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = String(req.query.code || "");
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (!code) {
      return res.status(400).redirect(`${frontendUrl}?google_auth=error&message=Missing_authorization_code`);
    }

    try {
      await handleGoogleOAuthCallback(code);
      return res.redirect(`${frontendUrl}?google_auth=success`);
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[GoogleOAuth] Error exchanging code:", error);
      return res.redirect(`${frontendUrl}?google_auth=error&message=${encodeURIComponent(error.message)}`);
    }
  });

  // Get current Google connection status
  app.get("/api/auth/google/status", (_req: Request, res: Response) => {
    try {
      const status = getGoogleAuthStatus();
      return res.json(status);
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).json({ error: error.message || "Failed to check Google auth status" });
    }
  });

  // Disconnect Google OAuth tokens
  app.post("/api/auth/google/disconnect", (_req: Request, res: Response) => {
    const success = clearStoredGoogleTokens();
    return res.json({ success, message: "Google Workspace disconnected." });
  });

  // =========================================================================
  //                            CHAT ENDPOINTS
  // =========================================================================

  // Non-streaming chat invocation endpoint
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { message, threadId = "default-session" } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'message' field in request body." });
      }

      const result = await invokeAgent(message, threadId);

      // Check if the graph was interrupted for HITL confirmation
      const interruptState = await getThreadInterruptState(threadId);
      if (interruptState) {
        return res.status(202).json({
          interrupted: true,
          threadId,
          confirmationRequired: true,
          payload: interruptState,
          content: result.content,
          message: "Tool execution requires your confirmation. Use POST /api/permissions/confirm/:threadId to approve or reject.",
        });
      }

      return res.json({
        content: result.content,
        threadId,
        toolCallsCount: result.toolCallsCount,
      });
    } catch (err: unknown) {
      const error = err as Error;

      // Check if this is a GraphInterrupt (HITL confirmation needed)
      if (error.name === "GraphInterrupt" || (error as any).lc_error_code === "GRAPH_INTERRUPT") {
        // The graph was interrupted for HITL; check interrupt state
        try {
          const threadId = req.body.threadId || "default-session";
          const interruptState = await getThreadInterruptState(threadId);
          return res.status(202).json({
            interrupted: true,
            threadId,
            confirmationRequired: true,
            payload: interruptState,
            message: "Tool execution requires your confirmation. Use POST /api/permissions/confirm/:threadId to approve or reject.",
          });
        } catch {
          // Fall through to generic error
        }
      }

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

      // After stream completes, check if the graph was interrupted for HITL
      const interruptState = await getThreadInterruptState(threadId);
      if (interruptState) {
        res.write(
          `data: ${JSON.stringify({
            type: "confirmation_required",
            threadId,
            payload: interruptState,
            message: "Tool execution requires your confirmation.",
          })}\n\n`
        );
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: unknown) {
      const error = err as Error;

      // Check if this is a GraphInterrupt (HITL confirmation needed)
      if (error.name === "GraphInterrupt" || (error as any).lc_error_code === "GRAPH_INTERRUPT") {
        try {
          const interruptState = await getThreadInterruptState(threadId);
          res.write(
            `data: ${JSON.stringify({
              type: "confirmation_required",
              threadId,
              payload: interruptState,
              message: "Tool execution requires your confirmation.",
            })}\n\n`
          );
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        } catch {
          // Fall through to generic error
        }
      }

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
