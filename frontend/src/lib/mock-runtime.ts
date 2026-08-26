"use client";

import { useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import { useState } from "react";

/**
 * Creates an interactive mock chat model adapter that simulates realistic
 * assistant streaming responses with code blocks, markdown formatting, and tool suggestions.
 */
export function createMockChatModel(activeModelName: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const lastMessage = messages[messages.length - 1];
      const userText =
        lastMessage?.content
          ?.map((c) => (c.type === "text" ? c.text : ""))
          .join(" ")
          .trim()
          .toLowerCase() || "";

      let fullResponse = "";

      if (userText.includes("tool") || userText.includes("permission") || userText.includes("mcp")) {
        fullResponse =
          `I am operating in **${activeModelName}** mode with the Developer Assistant Tool Gate enabled.\n\n` +
          `### Available Tool Capabilities\n\n` +
          `1. **Filesystem (READ / WRITE)**: Scoped inspection and modification of repository files.\n` +
          `2. **Terminal (READ / DESTRUCTIVE)**: Sandboxed command execution with strict permission verification.\n` +
          `3. **GitHub MCP (READ / WRITE)**: Query and manage issues, pull requests, and commits.\n\n` +
          `When a destructive or write tool is invoked, the UI will present an interactive confirmation card before execution.`;
      } else if (userText.includes("code") || userText.includes("component") || userText.includes("function")) {
        fullResponse =
          `Here is an example TypeScript implementation demonstrating the permission-aware tool wrapper for LangGraph:\n\n` +
          "```typescript\n" +
          "import { DynamicStructuredTool } from '@langchain/core/tools';\n" +
          "import { z } from 'zod';\n\n" +
          "export const inspectRepoTool = new DynamicStructuredTool({\n" +
          "  name: 'inspect_repository',\n" +
          "  description: 'Analyze repository file tree and package configuration.',\n" +
          "  schema: z.object({\n" +
          "    path: z.string().default('.'),\n" +
          "    depth: z.number().max(3).default(1),\n" +
          "  }),\n" +
          "  func: async ({ path, depth }) => {\n" +
          "    // Permission check: READ access is permitted by default\n" +
          "    return JSON.stringify({ status: 'ok', path, depth });\n" +
          "  },\n" +
          "});\n" +
          "```\n\n" +
          `You can test this tool once the LangGraph engine is connected in Step 2.`;
      } else {
        fullResponse =
          `Developer Assistant is initialized and ready using **${activeModelName}**.\n\n` +
          `You can use this cockpit to:\n` +
          `- Review code and inspect pull requests\n` +
          `- Execute sandboxed terminal commands with safety gates\n` +
          `- Switch seamlessly between local inference (Ollama / LM Studio) and cloud LLMs\n` +
          `- Manage human-in-the-loop approvals for destructive operations\n\n` +
          `What task would you like to work on next?`;
      }

      // Stream tokens chunk by chunk
      const chunkSize = 4;
      for (let i = 0; i < fullResponse.length; i += chunkSize) {
        if (abortSignal.aborted) break;
        const currentChunk = fullResponse.slice(0, i + chunkSize);
        yield {
          content: [
            {
              type: "text" as const,
              text: currentChunk,
            },
          ],
        };
        // Small delay to simulate realistic streaming
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  };
}

/**
 * Hook providing a local runtime configured with the active model.
 */
export function useAssistantMockRuntime(activeModelName: string = "Llama 3.2 3B") {
  const [modelName, setModelName] = useState(activeModelName);
  const runtime = useLocalRuntime(createMockChatModel(modelName));
  return { runtime, setModelName };
}
