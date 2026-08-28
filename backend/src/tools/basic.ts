import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Calculator Tool: Safely evaluates basic mathematical expressions
 */
export const calculatorTool = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Sanitize expression to only allow digits, arithmetic operators, parentheses, decimal points, and spaces
      const sanitized = expression.replace(/\s+/g, "");
      if (!/^[0-9+\-*/().%^]+$/.test(sanitized)) {
        return JSON.stringify({
          error: "Invalid characters in mathematical expression. Only numbers and +, -, *, /, %, ^, () are permitted.",
        });
      }

      // Replace ^ with ** for exponentiation
      const formatted = sanitized.replace(/\^/g, "**");

      // Safely evaluate arithmetic expression using Function constructor with isolated scope
      const compute = new Function(`return (${formatted})`);
      const result = compute();

      if (typeof result !== "number" || !isFinite(result)) {
        return JSON.stringify({
          error: "Mathematical evaluation resulted in an invalid or infinite number.",
        });
      }

      return JSON.stringify({
        expression,
        result,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Calculation failed: ${error.message}`,
      });
    }
  },
  {
    name: "calculator",
    description: "Useful for performing mathematical calculations and evaluating arithmetic expressions (e.g. addition, subtraction, multiplication, division, exponents).",
    schema: z.object({
      expression: z
        .string()
        .describe("The arithmetic expression to evaluate, e.g., '1548 * 372' or '(120 / 4) + 18'"),
    }),
  }
);

/**
 * Get Time Tool: Returns current time, date, and timezone information
 */
export const getTimeTool = tool(
  async ({ timezone }: { timezone?: string }) => {
    try {
      const now = new Date();
      const tz = timezone && timezone.toLowerCase() !== "local" ? timezone : undefined;

      const options: Intl.DateTimeFormatOptions = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
        timeZone: tz,
      };

      const formatted = new Intl.DateTimeFormat("en-US", options).format(now);
      const iso = now.toISOString();

      return JSON.stringify({
        currentTime: formatted,
        isoTimestamp: iso,
        timezone: tz || "Local System Time",
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to retrieve time for timezone '${timezone}': ${error.message}`,
      });
    }
  },
  {
    name: "get_time",
    description: "Useful for getting the current system date, time, and timezone information.",
    schema: z.object({
      timezone: z
        .string()
        .optional()
        .describe("Optional IANA timezone name, e.g. 'UTC', 'America/New_York', 'Asia/Tokyo', or 'Europe/London'"),
    }),
  }
);

import { getGitHubAccessToken } from "../auth/github-oauth.js";

/**
 * List My GitHub Repositories Tool: Direct authenticated repository retrieval
 */
export const listMyGithubRepositoriesTool = tool(
  async ({ per_page = 50 }: { per_page?: number }) => {
    const token = await getGitHubAccessToken();
    if (!token) {
      return JSON.stringify({
        error: "GitHub is not connected. Connect your GitHub account via the Integrations button in the UI or visit /api/auth/github/url.",
      });
    }

    try {
      const response = await fetch(
        `https://api.github.com/user/repos?per_page=${per_page}&sort=updated&affiliation=owner,collaborator`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Personal-Assistant-Agent",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return JSON.stringify({
          error: `GitHub API request failed with status ${response.status}: ${errorText}`,
        });
      }

      const repos = await response.json();
      if (!Array.isArray(repos)) {
        return JSON.stringify({ error: "Unexpected response format from GitHub API." });
      }

      return JSON.stringify({
        total: repos.length,
        repositories: repos.map((r: any) => ({
          name: r.name,
          fullName: r.full_name,
          owner: r.owner?.login,
          private: r.private,
          htmlUrl: r.html_url,
          description: r.description || "No description provided",
          language: r.language || "Unknown",
          updatedAt: r.updated_at,
          defaultBranch: r.default_branch,
          stars: r.stargazers_count,
          forks: r.forks_count,
        })),
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to fetch authenticated repositories: ${error.message}`,
      });
    }
  },
  {
    name: "list_my_github_repositories",
    description: "Fetches all personal and collaborated GitHub repositories belonging to the authenticated user via GitHub OAuth.",
    schema: z.object({
      per_page: z.number().optional().describe("Maximum number of repositories to return (default: 50)"),
    }),
  }
);

import { runTerminalCommandTool } from "./terminal.js";
export { runTerminalCommandTool };

/**
 * Exported basic tools array
 */
export const basicTools = [
  calculatorTool,
  getTimeTool,
  listMyGithubRepositoriesTool,
  runTerminalCommandTool,
];
