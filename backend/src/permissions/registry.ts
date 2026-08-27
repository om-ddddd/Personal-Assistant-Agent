/**
 * Tool Permission Registry.
 *
 * Maintains a mapping of tool names to their risk levels and provides
 * permission checks. Unknown tools default to WRITE (require confirmation)
 * to enforce a safe-by-default policy.
 */

import {
  ToolRiskLevel,
  ToolPermissionEntry,
  PermissionDecision,
} from "./types.js";

/**
 * Internal registry map: toolName -> ToolPermissionEntry
 */
const registry = new Map<string, ToolPermissionEntry>();

/**
 * Default classifications for all known tools.
 * MCP tools are registered dynamically at runtime via registerTool().
 */
const DEFAULT_CLASSIFICATIONS: Record<string, ToolRiskLevel> = {
  // Basic tools
  calculator: ToolRiskLevel.READ,
  get_time: ToolRiskLevel.READ,
  list_my_github_repositories: ToolRiskLevel.READ,

  // Google Calendar
  list_calendar_events: ToolRiskLevel.READ,
  create_calendar_event: ToolRiskLevel.WRITE,
  delete_calendar_event: ToolRiskLevel.DESTRUCTIVE,

  // Gmail
  list_emails: ToolRiskLevel.READ,
  read_email: ToolRiskLevel.READ,
  send_email: ToolRiskLevel.WRITE,

  // MCP Filesystem - read operations
  read_file: ToolRiskLevel.READ,
  read_text_file: ToolRiskLevel.READ,
  list_directory: ToolRiskLevel.READ,
  search_files: ToolRiskLevel.READ,
  get_file_info: ToolRiskLevel.READ,
  list_allowed_directories: ToolRiskLevel.READ,

  // MCP Filesystem - write operations
  write_file: ToolRiskLevel.WRITE,
  edit_file: ToolRiskLevel.WRITE,
  create_directory: ToolRiskLevel.WRITE,
  move_file: ToolRiskLevel.WRITE,

  // MCP Filesystem - destructive operations
  delete_file: ToolRiskLevel.DESTRUCTIVE,

  // MCP GitHub - read operations
  list_issues: ToolRiskLevel.READ,
  get_issue: ToolRiskLevel.READ,
  list_pull_requests: ToolRiskLevel.READ,
  get_pull_request: ToolRiskLevel.READ,
  list_commits: ToolRiskLevel.READ,
  get_file_contents: ToolRiskLevel.READ,
  search_repositories: ToolRiskLevel.READ,
  search_code: ToolRiskLevel.READ,
  search_issues: ToolRiskLevel.READ,
  list_branches: ToolRiskLevel.READ,
  get_commit: ToolRiskLevel.READ,

  // MCP GitHub - write operations
  create_issue: ToolRiskLevel.WRITE,
  update_issue: ToolRiskLevel.WRITE,
  add_issue_comment: ToolRiskLevel.WRITE,
  create_pull_request: ToolRiskLevel.WRITE,
  create_branch: ToolRiskLevel.WRITE,
  push_files: ToolRiskLevel.WRITE,
  create_or_update_file: ToolRiskLevel.WRITE,
  fork_repository: ToolRiskLevel.WRITE,
  create_repository: ToolRiskLevel.WRITE,

  // MCP GitHub - destructive operations
  delete_branch: ToolRiskLevel.DESTRUCTIVE,
  merge_pull_request: ToolRiskLevel.DESTRUCTIVE,
};

/**
 * Initialize the registry with all default classifications.
 */
function ensureInitialized(): void {
  if (registry.size > 0) return;

  for (const [toolName, riskLevel] of Object.entries(DEFAULT_CLASSIFICATIONS)) {
    registry.set(toolName, {
      toolName,
      riskLevel,
      description: `${riskLevel} operation: ${toolName}`,
    });
  }

  console.log(
    `[PermissionRegistry] Initialized with ${registry.size} tool classifications.`
  );
}

/**
 * Register or re-classify a tool at runtime.
 * Used primarily for dynamically loaded MCP tools.
 */
export function registerTool(
  toolName: string,
  riskLevel: ToolRiskLevel,
  description?: string
): void {
  ensureInitialized();
  registry.set(toolName, {
    toolName,
    riskLevel,
    description: description || `${riskLevel} operation: ${toolName}`,
  });
}

/**
 * Bulk-register multiple tools. Skips tools that already have a
 * classification unless `overwrite` is true.
 */
export function registerTools(
  tools: Array<{ name: string; description?: string }>,
  defaultRiskLevel: ToolRiskLevel = ToolRiskLevel.WRITE,
  overwrite: boolean = false
): void {
  ensureInitialized();
  for (const tool of tools) {
    if (!overwrite && registry.has(tool.name)) continue;
    if (!registry.has(tool.name)) {
      registerTool(tool.name, defaultRiskLevel, tool.description);
    }
  }
}

/**
 * Get the risk level for a specific tool.
 * Returns WRITE for unknown tools (safe-by-default).
 */
export function getToolRiskLevel(toolName: string): ToolRiskLevel {
  ensureInitialized();
  const entry = registry.get(toolName);
  return entry ? entry.riskLevel : ToolRiskLevel.WRITE;
}

/**
 * Check whether a tool call is permitted and whether it requires
 * human-in-the-loop confirmation.
 */
export function checkPermission(toolName: string): PermissionDecision {
  ensureInitialized();
  const riskLevel = getToolRiskLevel(toolName);

  return {
    toolName,
    riskLevel,
    allowed: true, // all tools are allowed; WRITE/DESTRUCTIVE just need confirmation
    requiresConfirmation: riskLevel !== ToolRiskLevel.READ,
  };
}

/**
 * Get the full registry entry for a tool, or undefined if not registered.
 */
export function getToolEntry(toolName: string): ToolPermissionEntry | undefined {
  ensureInitialized();
  return registry.get(toolName);
}

/**
 * List all registered tools and their classifications.
 */
export function listRegisteredTools(): ToolPermissionEntry[] {
  ensureInitialized();
  return Array.from(registry.values());
}

/**
 * Get a summary of the registry grouped by risk level.
 */
export function getRegistrySummary(): Record<ToolRiskLevel, string[]> {
  ensureInitialized();
  const summary: Record<ToolRiskLevel, string[]> = {
    [ToolRiskLevel.READ]: [],
    [ToolRiskLevel.WRITE]: [],
    [ToolRiskLevel.DESTRUCTIVE]: [],
  };

  for (const entry of registry.values()) {
    summary[entry.riskLevel].push(entry.toolName);
  }

  return summary;
}
