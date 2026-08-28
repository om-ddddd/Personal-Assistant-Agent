import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import path from "path";
import { ToolRiskLevel } from "../permissions/types.js";

/**
 * Root directory of the developer workspace.
 * Resolves to the root repository folder ("Personal Assistant Agent").
 */
export const WORKSPACE_ROOT = path.resolve(process.cwd(), "..");

/**
 * Dangerous command patterns that are strictly blocked from execution.
 */
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf|-fr|\/[a-z]|\*)/i,
  /rmdir\s+(\/s|\/q|[a-z]:\\)/i,
  /del\s+(\/f|\/s|\/q|[a-z]:\\)/i,
  /\b(format|mkfs|fdisk|dd\s+if=)\b/i,
  /\b(shutdown|reboot|poweroff|init\s+0)\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // Fork bomb
  />\s*(\/dev\/sd[a-z]|\/dev\/nvme|C:\\Windows)/i,
];

/**
 * Check if a command matches any dangerous destructive patterns.
 */
export function isDangerousCommand(command: string): { blocked: boolean; pattern?: string } {
  const trimmed = command.trim();
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { blocked: true, pattern: pattern.toString() };
    }
  }
  return { blocked: false };
}

/**
 * Classify a terminal command's risk level dynamically.
 */
export function classifyTerminalCommand(command: string): ToolRiskLevel {
  const trimmed = command.trim();

  // Check for destructive patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return ToolRiskLevel.DESTRUCTIVE;
    }
  }

  if (/\b(git\s+reset\s+--hard|git\s+clean\s+-f|dropdb|drop\s+database)\b/i.test(trimmed)) {
    return ToolRiskLevel.DESTRUCTIVE;
  }

  // Safe read-only inspection commands
  const READ_ONLY_PATTERNS = [
    /^(git\s+(status|log|diff|branch|show|remote|tag|describe))\b/i,
    /^(npm\s+(test|run\s+test|run\s+typecheck|list|outdated|view|why))\b/i,
    /^(npx\s+(tsc\s+--noEmit|eslint))\b/i,
    /^(node\s+(-v|--version)|npm\s+(-v|--version)|git\s+--version)\b/i,
    /^(ls|dir|cat|type|pwd|echo|which|where)\b/i,
  ];

  for (const pattern of READ_ONLY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return ToolRiskLevel.READ;
    }
  }

  // All other commands (e.g. npm install, git commit, git push, build) default to WRITE
  return ToolRiskLevel.WRITE;
}

/**
 * Redact sensitive API keys and secrets from output strings.
 */
export function sanitizeOutput(output: string): string {
  if (!output) return "";
  return output
    .replace(/nvapi-[a-zA-Z0-9_-]{20,}/g, "[REDACTED_NVIDIA_KEY]")
    .replace(/gsk_[a-zA-Z0-9_-]{20,}/g, "[REDACTED_GROQ_KEY]")
    .replace(/ghp_[a-zA-Z0-9]{20,}/g, "[REDACTED_API_TOKEN]")
    .replace(/postgresql:\/\/[^@\s]+@[^\s]+/g, "[REDACTED_DATABASE_URI]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/gi, "Bearer [REDACTED_TOKEN]");
}

/**
 * Validates that target cwd stays strictly inside the workspace root.
 */
export function resolveSafeCwd(targetCwd?: string): string {
  if (!targetCwd) {
    return WORKSPACE_ROOT;
  }

  const resolved = path.isAbsolute(targetCwd)
    ? path.resolve(targetCwd)
    : path.resolve(WORKSPACE_ROOT, targetCwd);

  const relative = path.relative(WORKSPACE_ROOT, resolved);

  // If path starts with '..' or is outside workspace root, reject
  if (relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(
      `Access denied: Target directory '${targetCwd}' is outside the authorized workspace root ('${WORKSPACE_ROOT}').`
    );
  }

  return resolved;
}

/**
 * Executes a terminal command safely within the workspace boundary.
 */
export async function executeTerminalCommand(
  command: string,
  targetCwd?: string,
  timeoutMs: number = 15000
): Promise<{
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}> {
  const cleanCommand = command.trim();
  if (!cleanCommand) {
    throw new Error("Command cannot be empty.");
  }

  // 1. Check dangerous denylist
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cleanCommand)) {
      throw new Error(`Execution blocked: Dangerous or destructive command detected ('${cleanCommand}').`);
    }
  }

  // 2. Validate workspace directory boundary
  const safeCwd = resolveSafeCwd(targetCwd);

  // 3. Scrub sensitive environment variables
  const sanitizedEnv = { ...process.env };
  delete sanitizedEnv.DATABASE_URL;
  delete sanitizedEnv.DIRECT_URL;
  delete sanitizedEnv.NVIDIA_API_KEY;
  delete sanitizedEnv.GROQ_API_KEY;
  delete sanitizedEnv.GOOGLE_CLIENT_SECRET;
  delete sanitizedEnv.GITHUB_PERSONAL_ACCESS_TOKEN;
  delete sanitizedEnv.GITHUB_TOKEN;

  const startTime = Date.now();

  return new Promise((resolve) => {
    exec(
      cleanCommand,
      {
        cwd: safeCwd,
        env: sanitizedEnv,
        timeout: Math.min(Math.max(timeoutMs, 1000), 60000), // Clamp between 1s and 60s
        maxBuffer: 2 * 1024 * 1024, // 2MB output buffer
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0;

        resolve({
          command: cleanCommand,
          cwd: safeCwd,
          exitCode,
          stdout: sanitizeOutput(stdout || ""),
          stderr: sanitizeOutput(stderr || (error ? error.message : "")),
          durationMs,
        });
      }
    );
  });
}

/**
 * Convenience helper for object-based invocation.
 */
export async function run_terminal_command(args: {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}) {
  return executeTerminalCommand(args.command, args.cwd, args.timeoutMs);
}

/**
 * Terminal Execution Tool for LangGraph Agent
 */
export const runTerminalCommandTool = tool(
  async ({ command, cwd, timeoutMs }: { command: string; cwd?: string; timeoutMs?: number }) => {
    try {
      const result = await executeTerminalCommand(command, cwd, timeoutMs);
      return JSON.stringify({
        success: result.exitCode === 0,
        ...result,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        success: false,
        command,
        error: error.message || "Failed to execute command",
      });
    }
  },
  {
    name: "run_terminal_command",
    description:
      "Execute a shell or terminal command safely within the developer workspace. " +
      "Use this tool to run tests (npm test), check type errors (npx tsc --noEmit), inspect git repository status (git status, git log), " +
      "or execute project build commands. Destructive commands outside the workspace are strictly blocked.",
    schema: z.object({
      command: z
        .string()
        .describe("The shell command to execute (e.g. 'npm test', 'git status', 'npx tsc --noEmit')."),
      cwd: z
        .string()
        .optional()
        .describe("Optional working directory relative to the project root (e.g. 'backend' or 'frontend')."),
      timeoutMs: z
        .number()
        .optional()
        .default(15000)
        .describe("Maximum execution time in milliseconds before terminating (default: 15000, max: 60000)."),
    }),
  }
);
