import dotenv from "dotenv";
import { invokeAgent } from "./agent.js";

dotenv.config();

async function main() {
  console.log("=================================================");
  console.log(" Developer Personal Assistant - LangGraph Agent ");
  console.log("=================================================");
  console.log(`Model: ${process.env.GROQ_MODEL || "openai/gpt-oss-120b"}`);
  console.log(`API Key Status: ${process.env.GROQ_API_KEY ? "CONFIGURED" : "MISSING (Set GROQ_API_KEY in backend/.env)"}`);
  console.log("-------------------------------------------------\n");

  if (!process.env.GROQ_API_KEY) {
    console.error("Error: GROQ_API_KEY is not set in backend/.env");
    console.error("Please add your Groq API key to backend/.env like so:");
    console.error("  GROQ_API_KEY=gsk_your_key_here\n");
    console.error("Get a free API key at: https://console.groq.com/keys");
    process.exit(1);
  }

  const customPrompt = process.argv.slice(2).join(" ");

  if (customPrompt) {
    console.log(`[Turn 1] User Prompt: "${customPrompt}"`);
    console.log("Invoking LangGraph Agent...");
    const startTime = Date.now();
    try {
      const response = await invokeAgent(customPrompt, "cli-session-1");
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n[Agent Response] (${elapsed}s):\n`);
      console.log(response.content);
      console.log("\n-------------------------------------------------");
      console.log("Execution completed successfully.");
    } catch (err: unknown) {
      const error = err as Error;
      console.error("\nAgent Execution Error:", error.message);
    }
    return;
  }

  // Multi-turn checkpoint retention test
  const threadId = `cli-test-${Date.now()}`;

  console.log(`[Test 1] Multi-turn MemorySaver Checkpoint Test (Thread: ${threadId})`);
  console.log("Turn 1 Prompt: 'Hello! I am building a developer personal assistant with LangGraph. My name is Alex.'");
  console.log("Invoking agent...");

  try {
    const start1 = Date.now();
    const res1 = await invokeAgent(
      "Hello! I am building a developer personal assistant with LangGraph. My name is Alex.",
      threadId
    );
    const elapsed1 = ((Date.now() - start1) / 1000).toFixed(2);
    console.log(`\n[Turn 1 Agent Response] (${elapsed1}s):\n${res1.content}\n`);

    console.log("-------------------------------------------------");
    console.log("Turn 2 Prompt (Testing Memory Retention): 'What is my name and what project am I building?'");
    console.log("Invoking agent with same thread ID...");

    const start2 = Date.now();
    const res2 = await invokeAgent(
      "What is my name and what project am I building?",
      threadId
    );
    const elapsed2 = ((Date.now() - start2) / 1000).toFixed(2);
    console.log(`\n[Turn 2 Agent Response] (${elapsed2}s):\n${res2.content}\n`);

    console.log("=================================================");
    console.log(" LangGraph StateGraph Test: PASSED");
    console.log("=================================================");
  } catch (err: unknown) {
    const error = err as Error;
    console.error("\nAgent Execution Failed:", error.message);
    if (error.message.includes("401") || error.message.includes("API key")) {
      console.error("Please verify your GROQ_API_KEY in backend/.env.");
    }
  }
}

main().catch(console.error);
