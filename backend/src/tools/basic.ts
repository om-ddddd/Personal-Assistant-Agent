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

/**
 * Exported basic tools array
 */
export const basicTools = [calculatorTool, getTimeTool];
