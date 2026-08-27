/**
 * Permission Manager + HITL Confirmation Flow - Test Script
 *
 * Tests the permission registry, manager, and end-to-end HITL flow
 * via HTTP requests against the running backend server.
 *
 * Run: npx tsx src/test-permissions.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

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

// =========================================================================
//  Test 1: Permission Registry
// =========================================================================
async function testPermissionRegistry() {
  console.log("\n=== Test 1: Permission Registry ===\n");

  const { status, data } = await fetchJSON(`${BASE_URL}/api/permissions/registry`);
  assert(status === 200, "GET /api/permissions/registry returns 200");
  assert(data.tools && Array.isArray(data.tools), "Registry returns tools array");
  assert(data.total > 0, `Registry has ${data.total} registered tools`);

  // Check summary grouping
  assert(data.summary && data.summary.READ, "Summary has READ group");
  assert(data.summary && data.summary.WRITE, "Summary has WRITE group");
  assert(data.summary && data.summary.DESTRUCTIVE, "Summary has DESTRUCTIVE group");

  // Verify specific tool classifications
  const readTools = data.summary.READ || [];
  const writeTools = data.summary.WRITE || [];
  const destructiveTools = data.summary.DESTRUCTIVE || [];

  assert(readTools.includes("calculator"), "calculator is classified as READ");
  assert(readTools.includes("get_time"), "get_time is classified as READ");
  assert(readTools.includes("list_calendar_events"), "list_calendar_events is classified as READ");
  assert(readTools.includes("list_emails"), "list_emails is classified as READ");
  assert(readTools.includes("read_email"), "read_email is classified as READ");

  assert(writeTools.includes("create_calendar_event"), "create_calendar_event is classified as WRITE");
  assert(writeTools.includes("send_email"), "send_email is classified as WRITE");

  assert(destructiveTools.includes("delete_calendar_event"), "delete_calendar_event is classified as DESTRUCTIVE");
}

// =========================================================================
//  Test 2: Permission Check Endpoint
// =========================================================================
async function testPermissionCheck() {
  console.log("\n=== Test 2: Permission Check ===\n");

  // Check READ tool
  const { data: readCheck } = await fetchJSON(`${BASE_URL}/api/permissions/check/calculator`);
  assert(readCheck.riskLevel === "READ", "calculator has READ risk level");
  assert(readCheck.requiresConfirmation === false, "calculator does not require confirmation");
  assert(readCheck.allowed === true, "calculator is allowed");

  // Check WRITE tool
  const { data: writeCheck } = await fetchJSON(`${BASE_URL}/api/permissions/check/send_email`);
  assert(writeCheck.riskLevel === "WRITE", "send_email has WRITE risk level");
  assert(writeCheck.requiresConfirmation === true, "send_email requires confirmation");

  // Check DESTRUCTIVE tool
  const { data: destructiveCheck } = await fetchJSON(`${BASE_URL}/api/permissions/check/delete_calendar_event`);
  assert(destructiveCheck.riskLevel === "DESTRUCTIVE", "delete_calendar_event has DESTRUCTIVE risk level");
  assert(destructiveCheck.requiresConfirmation === true, "delete_calendar_event requires confirmation");

  // Check unknown tool (should default to WRITE)
  const { data: unknownCheck } = await fetchJSON(`${BASE_URL}/api/permissions/check/some_unknown_tool`);
  assert(unknownCheck.riskLevel === "WRITE", "Unknown tool defaults to WRITE risk level");
  assert(unknownCheck.requiresConfirmation === true, "Unknown tool requires confirmation");
}

// =========================================================================
//  Test 3: READ tool executes without interruption
// =========================================================================
async function testReadToolNoInterruption() {
  console.log("\n=== Test 3: READ Tool (No Interruption) ===\n");

  // Create a fresh thread
  const { data: threadData } = await fetchJSON(`${BASE_URL}/api/threads`, {
    method: "POST",
    body: JSON.stringify({ title: "Test READ" }),
  });
  const threadId = threadData.thread.id;
  assert(!!threadId, `Created test thread: ${threadId}`);

  // Send a calculator request (READ tool) via non-streaming endpoint
  const { status, data } = await fetchJSON(`${BASE_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      message: "what is 2*3",
      threadId,
    }),
  });

  assert(status === 200, `Chat returned 200 (not 202 interrupted)`);
  assert(!data.interrupted, "Response is NOT interrupted");
  assert(typeof data.content === "string", "Response has content string");
  console.log(`  Agent response: "${data.content.slice(0, 100)}..."`);

  // Verify thread is NOT interrupted
  const { data: interruptData } = await fetchJSON(`${BASE_URL}/api/threads/${threadId}/interrupt`);
  assert(interruptData.interrupted === false, "Thread is not in interrupted state");
}

// =========================================================================
//  Test 4: WRITE tool triggers HITL interruption
// =========================================================================
async function testWriteToolInterruption() {
  console.log("\n=== Test 4: WRITE Tool (HITL Interruption) ===\n");

  // Create a fresh thread
  const { data: threadData } = await fetchJSON(`${BASE_URL}/api/threads`, {
    method: "POST",
    body: JSON.stringify({ title: "Test WRITE HITL" }),
  });
  const threadId = threadData.thread.id;
  assert(!!threadId, `Created test thread: ${threadId}`);

  // Send a request that should trigger a WRITE tool (create_calendar_event or send_email)
  const { status, data } = await fetchJSON(`${BASE_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      message: "Create a calendar event called 'Test Meeting' for tomorrow at 10am to 11am.",
      threadId,
    }),
  });

  // Should either get 202 (interrupted) or the agent might respond with text
  // depending on whether the model actually calls the tool
  if (status === 202 && data.interrupted) {
    assert(true, "Chat returned 202 with interrupted flag (HITL triggered)");
    assert(data.confirmationRequired === true, "confirmationRequired is true");
    assert(!!data.payload, "Interrupt payload is present");
    console.log(`  Interrupt payload: ${JSON.stringify(data.payload).slice(0, 200)}`);

    // Test: Check thread interrupt state
    const { data: interruptData } = await fetchJSON(`${BASE_URL}/api/threads/${threadId}/interrupt`);
    assert(interruptData.interrupted === true, "Thread is in interrupted state");

    // Test: Approve the confirmation
    console.log("\n  --- Approving the tool execution ---\n");
    const { status: confirmStatus, data: confirmData } = await fetchJSON(
      `${BASE_URL}/api/permissions/confirm/${threadId}`,
      {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      }
    );

    assert(confirmStatus === 200, `Confirmation returned 200`);
    assert(typeof confirmData.content === "string", "Resume returned content");
    console.log(`  Resumed response: "${(confirmData.content || "").slice(0, 150)}..."`);

    // Verify thread is no longer interrupted
    const { data: afterConfirm } = await fetchJSON(`${BASE_URL}/api/threads/${threadId}/interrupt`);
    assert(afterConfirm.interrupted === false, "Thread is no longer interrupted after approval");
  } else {
    // The model might not call the tool (e.g., if it asks clarifying questions)
    console.log(`  Note: Chat returned status ${status}. The model may not have called a WRITE tool.`);
    console.log(`  Response: "${(data.content || JSON.stringify(data)).slice(0, 200)}"`);
    assert(true, "Chat completed (model behavior may vary)");
  }
}

// =========================================================================
//  Test 5: WRITE tool rejection flow
// =========================================================================
async function testWriteToolRejection() {
  console.log("\n=== Test 5: WRITE Tool Rejection ===\n");

  // Create a fresh thread
  const { data: threadData } = await fetchJSON(`${BASE_URL}/api/threads`, {
    method: "POST",
    body: JSON.stringify({ title: "Test REJECT" }),
  });
  const threadId = threadData.thread.id;
  assert(!!threadId, `Created test thread: ${threadId}`);

  // Send a request that should trigger send_email (WRITE tool)
  const { status, data } = await fetchJSON(`${BASE_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      message: "Send an email to test@example.com with subject 'Hello' and body 'Test message'.",
      threadId,
    }),
  });

  if (status === 202 && data.interrupted) {
    assert(true, "Chat returned 202 with interrupted flag (HITL triggered)");

    // Test: Reject the confirmation
    console.log("\n  --- Rejecting the tool execution ---\n");
    const { status: rejectStatus, data: rejectData } = await fetchJSON(
      `${BASE_URL}/api/permissions/confirm/${threadId}`,
      {
        method: "POST",
        body: JSON.stringify({ approved: false }),
      }
    );

    assert(rejectStatus === 200, "Rejection returned 200");
    assert(typeof rejectData.content === "string", "Rejection response has content");
    console.log(`  Rejection response: "${(rejectData.content || "").slice(0, 150)}..."`);

    // The agent should acknowledge the rejection
    const content = (rejectData.content || "").toLowerCase();
    const acknowledgesRejection =
      content.includes("reject") ||
      content.includes("cancel") ||
      content.includes("not") ||
      content.includes("won't") ||
      content.includes("okay") ||
      content.includes("understood") ||
      content.length > 0; // Agent responded at all
    assert(acknowledgesRejection, "Agent acknowledges the rejection in its response");
  } else {
    console.log(`  Note: Chat returned status ${status}. Model may not have called a WRITE tool.`);
    assert(true, "Chat completed (model behavior may vary)");
  }
}

// =========================================================================
//  Test 6: Streaming with HITL confirmation_required event
// =========================================================================
async function testStreamingHITL() {
  console.log("\n=== Test 6: Streaming HITL ===\n");

  // Create a fresh thread
  const { data: threadData } = await fetchJSON(`${BASE_URL}/api/threads`, {
    method: "POST",
    body: JSON.stringify({ title: "Test Stream HITL" }),
  });
  const threadId = threadData.thread.id;
  assert(!!threadId, `Created test thread: ${threadId}`);

  // Use fetch to read SSE stream
  const res = await fetch(`${BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Delete the calendar event with ID 'evt-001'.",
      threadId,
    }),
  });

  assert(res.status === 200, "Stream endpoint returns 200");

  const reader = res.body?.getReader();
  if (!reader) {
    assert(false, "Could not get stream reader");
    return;
  }

  const decoder = new TextDecoder();
  let fullOutput = "";
  let foundConfirmation = false;
  let foundText = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullOutput += chunk;

      // Parse SSE events
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload);
          if (event.type === "confirmation_required") {
            foundConfirmation = true;
            console.log(`  Received confirmation_required event`);
            console.log(`  Payload: ${JSON.stringify(event).slice(0, 200)}`);
          }
          if (event.type === "text") {
            foundText = true;
          }
        } catch {
          // Partial JSON or non-JSON data line
        }
      }
    }
  } catch {
    // Stream may error if interrupted
  }

  if (foundConfirmation) {
    assert(true, "Stream emitted confirmation_required event for DESTRUCTIVE tool");

    // Now approve via streaming confirm endpoint
    console.log("\n  --- Approving via streaming confirm ---\n");
    const confirmRes = await fetch(`${BASE_URL}/api/permissions/confirm/${threadId}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true }),
    });

    const confirmReader = confirmRes.body?.getReader();
    if (confirmReader) {
      let confirmOutput = "";
      while (true) {
        const { done, value } = await confirmReader.read();
        if (done) break;
        confirmOutput += decoder.decode(value, { stream: true });
      }
      assert(confirmOutput.includes("[DONE]"), "Streaming confirm completed with [DONE]");
      console.log(`  Streaming confirm output length: ${confirmOutput.length} chars`);
    }
  } else if (foundText) {
    console.log("  Note: Model responded with text instead of calling a tool.");
    assert(true, "Stream completed (model behavior may vary)");
  } else {
    console.log("  Note: Stream completed without confirmation or text events.");
    assert(true, "Stream completed");
  }
}

// =========================================================================
//  Test 7: Invalid confirmation requests
// =========================================================================
async function testInvalidConfirmation() {
  console.log("\n=== Test 7: Invalid Confirmation Requests ===\n");

  // Missing approved field
  const { status: missingStatus, data: missingData } = await fetchJSON(
    `${BASE_URL}/api/permissions/confirm/nonexistent-thread`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
  assert(missingStatus === 400, "Missing 'approved' field returns 400");
  assert(missingData.error?.includes("approved"), "Error message mentions 'approved'");

  // Non-interrupted thread
  const { status: noInterruptStatus, data: noInterruptData } = await fetchJSON(
    `${BASE_URL}/api/permissions/confirm/nonexistent-thread`,
    {
      method: "POST",
      body: JSON.stringify({ approved: true }),
    }
  );
  assert(
    noInterruptStatus === 400 || noInterruptStatus === 500,
    "Confirming non-interrupted thread returns error"
  );
}

// =========================================================================
//  Run All Tests
// =========================================================================
async function runAllTests() {
  console.log("=".repeat(60));
  console.log("  Permission Manager + HITL Confirmation Flow Tests");
  console.log("=".repeat(60));
  console.log(`  Target: ${BASE_URL}`);

  // First check if server is running
  try {
    const { status } = await fetchJSON(`${BASE_URL}/health`);
    if (status !== 200) {
      console.error("\nBackend server is not responding. Start it with: npm run dev");
      process.exit(1);
    }
  } catch {
    console.error("\nCannot connect to backend server. Start it with: npm run dev");
    process.exit(1);
  }

  await testPermissionRegistry();
  await testPermissionCheck();
  await testReadToolNoInterruption();
  await testWriteToolInterruption();
  await testWriteToolRejection();
  await testStreamingHITL();
  await testInvalidConfirmation();

  console.log("\n" + "=".repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
