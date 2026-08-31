import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { DynamicStructuredTool } from "@langchain/core/tools";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

// Always load .env from backend/.env
dotenv.config({ path: path.join(backendDir, ".env") });

const workspaceRootDir = process.env.WORKSPACE_ROOT || path.resolve(backendDir, "..");

import { getGitHubAccessToken } from "../auth/github-oauth.js";

let mcpClientInstance: MultiServerMCPClient | null = null;
let loadedMcpTools: DynamicStructuredTool[] = [];

/**
 * The workspace root that the current MCP client instance was initialized with.
 * Used to detect when a reinitialize is needed.
 */
let currentMcpWorkspaceRoot: string = workspaceRootDir;

/**
 * Get the system-level default workspace root (the project root directory).
 * Used as the fallback when a user has not set a custom workspace path.
 */
export function getDefaultWorkspaceRoot(): string {
  return workspaceRootDir;
}

/**
 * Initializes MultiServerMCPClient with Filesystem MCP and (optionally) GitHub MCP servers.
 *
 * @param workspaceRoot - The root directory to expose to the Filesystem MCP server.
 *   Defaults to the project root. Pass a user-specific path to scope the agent's
 *   file access per user. If the root differs from the previous instance, the
 *   existing client is torn down and rebuilt automatically.
 */
export async function initializeMcpClient(
  workspaceRoot: string = workspaceRootDir
): Promise<DynamicStructuredTool[]> {
  // If an instance already exists and the workspace root hasn't changed, reuse it
  if (mcpClientInstance && loadedMcpTools.length > 0 && currentMcpWorkspaceRoot === workspaceRoot) {
    return loadedMcpTools;
  }

  // Tear down stale instance if root changed
  if (mcpClientInstance && currentMcpWorkspaceRoot !== workspaceRoot) {
    try {
      await mcpClientInstance.close();
      console.log(`[MCP] Closed previous MCP client (root: ${currentMcpWorkspaceRoot}).`);
    } catch (err: unknown) {
      const error = err as Error;
      console.warn("[MCP] Error closing previous MCP client:", error.message);
    }
    mcpClientInstance = null;
    loadedMcpTools = [];
  }

  currentMcpWorkspaceRoot = workspaceRoot;
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const githubToken = (await getGitHubAccessToken()) || "";

  const serverConfigs: Record<string, any> = {
    filesystem: {
      transport: "stdio",
      command: npxCommand,
      args: ["-y", "@modelcontextprotocol/server-filesystem", workspaceRoot],
    },
  };

  // Only attach GitHub MCP if token is available
  if (githubToken) {
    serverConfigs["github"] = {
      transport: "stdio",
      command: npxCommand,
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
        PATH: process.env.PATH || "",
      },
    };
  }

  try {
    console.log(`[MCP] Connecting to MCP servers (Scoped root: ${workspaceRoot})...`);
    mcpClientInstance = new MultiServerMCPClient(serverConfigs);

    const tools = await mcpClientInstance.getTools();
    loadedMcpTools = tools;

    console.log(
      `[MCP] Successfully loaded ${tools.length} MCP tools: ${tools.map((t) => t.name).join(", ")}`
    );

    return loadedMcpTools;
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[MCP] Warning: Failed to connect to MCP servers:", error.message);
    loadedMcpTools = [];
    return [];
  }
}

/**
 * Returns currently loaded MCP tools.
 */
export function getLoadedMcpTools(): DynamicStructuredTool[] {
  return loadedMcpTools;
}

/**
 * Force close the active MCP client and clear cached tools.
 * The next call to initializeMcpClient() will reinitialize from scratch.
 */
export async function resetMcpClient(): Promise<void> {
  if (mcpClientInstance) {
    try {
      await mcpClientInstance.close();
      console.log("[MCP] MCP client reset — will reinitialize on next call.");
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[MCP] Error during reset:", error.message);
    } finally {
      mcpClientInstance = null;
      loadedMcpTools = [];
    }
  }
}

/**
 * Gracefully close active MCP client connections.
 */
export async function closeMcpClient(): Promise<void> {
  await resetMcpClient();
}
