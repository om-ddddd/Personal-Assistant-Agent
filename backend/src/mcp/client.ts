import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { DynamicStructuredTool } from "@langchain/core/tools";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const workspaceRootDir = path.resolve(backendDir, "..");

// Always load .env from backend/.env
dotenv.config({ path: path.join(backendDir, ".env") });

import { getGitHubAccessToken } from "../auth/github-oauth.js";

let mcpClientInstance: MultiServerMCPClient | null = null;
let loadedMcpTools: DynamicStructuredTool[] = [];

/**
 * Get the allowed root directory for the Filesystem MCP Server
 */
export function getWorkspaceRoot(): string {
  return workspaceRootDir;
}

/**
 * Initializes MultiServerMCPClient with Filesystem MCP and GitHub MCP servers
 */
export async function initializeMcpClient(): Promise<DynamicStructuredTool[]> {
  if (mcpClientInstance && loadedMcpTools.length > 0) {
    return loadedMcpTools;
  }

  const workspaceRoot = getWorkspaceRoot();
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

    // Load and adapt tools into LangChain DynamicStructuredTools
    const tools = await mcpClientInstance.getTools();
    loadedMcpTools = tools;

    console.log(
      `[MCP] Successfully loaded ${tools.length} MCP tools: ${tools
        .map((t) => t.name)
        .join(", ")}`
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
 * Returns currently loaded MCP tools
 */
export function getLoadedMcpTools(): DynamicStructuredTool[] {
  return loadedMcpTools;
}

/**
 * Gracefully close active MCP client connections
 */
export async function closeMcpClient(): Promise<void> {
  if (mcpClientInstance) {
    try {
      await mcpClientInstance.close();
      console.log("[MCP] MCP client connections closed.");
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[MCP] Error closing MCP connections:", error.message);
    } finally {
      mcpClientInstance = null;
      loadedMcpTools = [];
    }
  }
}
