/**
 * Focused HITL interrupt diagnostic test.
 *
 * Directly tests the LangGraph interrupt mechanism by:
 * 1. Sending a prompt that should trigger a WRITE tool call
 * 2. Checking the thread interrupt state
 * 3. Resuming with approval/rejection
 *
 * Run: npx tsx src/test-hitl-flow.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

async function fetchJSON(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function readSSEStream(url: string, body: any): Promise<{ events: any[]; raw: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const reader = res.body?.getReader();
  if (!reader) return { events: [], raw: "" };

  const decoder = new TextDecoder();
  let raw = "";
  const events: any[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;

    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        events.push(JSON.parse(payload));
      } catch {}
    }
  }

  return { events, raw };
}

async function runDiagnostic() {
  console.log("=".repeat(60));
  console.log("  HITL Interrupt Diagnostic Test");
  console.log("=".repeat(60));

  // 1. Check server
  const { status: healthStatus } = await fetchJSON(`${BASE_URL}/health`);
  if (healthStatus !== 200) {
    console.error("Server not running!");
    process.exit(1);
  }

  // 2. Create a thread
  const { data: threadData } = await fetchJSON(`${BASE_URL}/api/threads`, {
    method: "POST",
    body: JSON.stringify({ title: "HITL Diagnostic" }),
  });
  const threadId = threadData.thread.id;
  console.log(`\nThread: ${threadId}`);

  // 3. Send a request that MUST trigger a WRITE tool
  console.log("\n--- Step 1: Sending WRITE tool request via /api/chat ---\n");
  const { status: chatStatus, data: chatData } = await fetchJSON(`${BASE_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      message: "Use the create_calendar_event tool to schedule a meeting called 'HITL Test Meeting' tomorrow from 10:00 AM to 11:00 AM UTC. Start time: 2026-08-29T10:00:00Z, end time: 2026-08-29T11:00:00Z.",
      threadId,
    }),
  });

  console.log(`  Chat status: ${chatStatus}`);
  console.log(`  Chat data: ${JSON.stringify(chatData).slice(0, 300)}`);

  if (chatStatus === 202 && chatData.interrupted) {
    console.log("\n  >>> HITL Interrupt detected via 202 status! <<<\n");
  }

  // 4. Check interrupt state regardless
  console.log("\n--- Step 2: Checking thread interrupt state ---\n");
  const { data: interruptData } = await fetchJSON(`${BASE_URL}/api/threads/${threadId}/interrupt`);
  console.log(`  Interrupted: ${interruptData.interrupted}`);
  console.log(`  Payload: ${JSON.stringify(interruptData.payload).slice(0, 300)}`);

  if (interruptData.interrupted) {
    console.log("\n  >>> Thread IS interrupted - HITL is working! <<<\n");

    // 5. Resume with approval
    console.log("--- Step 3: Approving via /api/permissions/confirm ---\n");
    const { status: confirmStatus, data: confirmData } = await fetchJSON(
      `${BASE_URL}/api/permissions/confirm/${threadId}`,
      {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      }
    );
    console.log(`  Confirm status: ${confirmStatus}`);
    console.log(`  Confirm data: ${JSON.stringify(confirmData).slice(0, 300)}`);

    // 6. Check interrupt cleared
    const { data: afterData } = await fetchJSON(`${BASE_URL}/api/threads/${threadId}/interrupt`);
    console.log(`\n  After approval - Interrupted: ${afterData.interrupted}`);
  } else {
    console.log("\n  Thread is NOT interrupted.");
    console.log("  The tool may have been classified as READ, or the model did not call a tool.");
    console.log("  Checking permission classification...");

    const { data: permCheck } = await fetchJSON(`${BASE_URL}/api/permissions/check/create_calendar_event`);
    console.log(`  create_calendar_event: ${JSON.stringify(permCheck)}`);
  }

  // 7. Now test with streaming
  console.log("\n\n--- Step 4: Testing streaming HITL flow ---\n");

  const { data: threadData2 } = await fetchJSON(`${BASE_URL}/api/threads`, {
    method: "POST",
    body: JSON.stringify({ title: "HITL Stream Test" }),
  });
  const threadId2 = threadData2.thread.id;
  console.log(`  New thread: ${threadId2}`);

  const { events, raw } = await readSSEStream(`${BASE_URL}/api/chat/stream`, {
    message: "Please use send_email to send an email to test@example.com with subject 'Test' and body 'Hello from HITL test'.",
    threadId: threadId2,
  });

  console.log(`  Stream events: ${events.length}`);
  for (const e of events) {
    console.log(`    - type: ${e.type}${e.type === "text" ? `, text: "${(e.text || "").slice(0, 50)}"` : ""}`);
    if (e.type === "confirmation_required") {
      console.log(`      >>> STREAMING HITL CONFIRMATION DETECTED <<<`);
      console.log(`      Payload: ${JSON.stringify(e).slice(0, 200)}`);
    }
    if (e.error) {
      console.log(`      Error: ${e.error.slice(0, 200)}`);
    }
  }

  // Check interrupt state for streaming thread
  const { data: streamInterrupt } = await fetchJSON(`${BASE_URL}/api/threads/${threadId2}/interrupt`);
  console.log(`\n  Stream thread interrupted: ${streamInterrupt.interrupted}`);

  if (streamInterrupt.interrupted) {
    console.log("\n  >>> Streaming HITL working! Approving... <<<\n");

    const { events: resumeEvents } = await readSSEStream(
      `${BASE_URL}/api/permissions/confirm/${threadId2}/stream`,
      { approved: true }
    );
    console.log(`  Resume events: ${resumeEvents.length}`);
    for (const e of resumeEvents) {
      console.log(`    - type: ${e.type}${e.type === "text" ? `, text: "${(e.text || "").slice(0, 50)}"` : ""}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Diagnostic Complete");
  console.log("=".repeat(60));
}

runDiagnostic().catch((err) => {
  console.error("Diagnostic error:", err);
  process.exit(1);
});
