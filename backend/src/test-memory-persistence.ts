import {
  trimConversationMessages,
  summarizeConversationHistory,
  buildPromptWithMemoryContext,
  estimateMessageTokens,
} from "./memory/short-term.js";
import {
  touchThread,
  getThread,
  deleteThread,
  listThreads,
} from "./agent.js";
import { getCheckpointer } from "./db/checkpointer.js";
import {
  createPendingConfirmation,
  resolvePendingConfirmation,
  listPendingConfirmations,
} from "./permissions/manager.js";
import { ToolRiskLevel } from "./permissions/types.js";
import { checkDatabaseConnection, isDatabaseConnected } from "./db/prisma.js";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failedCount++;
  }
}

async function runTests() {
  await checkDatabaseConnection();
  console.log("\n============================================================");
  console.log("  Postgres Prisma Persistence & Short-Term Memory Tests");
  console.log("============================================================\n");

  // --- Test 1: Short-Term Memory Message Trimming ---
  console.log("=== Test 1: Short-Term Memory Message Trimming ===");
  const testMessages: BaseMessage[] = [
    new HumanMessage("Message 1: Hello"),
    new AIMessage("Message 2: Hi there"),
    new HumanMessage("Message 3: What is 2 + 2?"),
    new AIMessage("Message 4: 2 + 2 is 4"),
    new HumanMessage("Message 5: What is the capital of France?"),
    new AIMessage("Message 6: The capital of France is Paris"),
    new HumanMessage("Message 7: What is the weather?"),
    new AIMessage("Message 8: I need to check the weather"),
  ];

  const trimmed = await trimConversationMessages(testMessages, 4000, 4);
  assert(trimmed.length <= 4, `Trimmed messages count is <= 4 (got ${trimmed.length})`);
  assert(
    trimmed[trimmed.length - 1].content === "Message 8: I need to check the weather",
    "Last message is preserved in sliding window"
  );

  const tokens = estimateMessageTokens(testMessages);
  assert(tokens > 0, `Estimated tokens for test messages is positive (${tokens} tokens)`);

  // --- Test 2: Short-Term Memory Progressive Summarization ---
  console.log("\n=== Test 2: Short-Term Memory Progressive Summarization ===");
  const historyToSummarize: BaseMessage[] = [
    new HumanMessage("My name is Alex and I am developing a weather dashboard in TypeScript."),
    new AIMessage("Nice to meet you Alex! I can help you build your TypeScript weather dashboard."),
    new HumanMessage("We will use OpenWeather API and Tailwind CSS."),
    new AIMessage("Got it: OpenWeather API for data and Tailwind CSS for styling."),
    new HumanMessage("Let's create the project structure."),
    new AIMessage("Created folder structure with src/ and public/ directories."),
  ];

  const summary = await summarizeConversationHistory(historyToSummarize, "");
  assert(typeof summary === "string", "Summarizer returns a string");
  assert(summary.length > 0, `Generated summary is non-empty (${summary.length} chars)`);
  console.log(`  Summary preview: "${summary.slice(0, 120)}..."`);

  const promptWithMemory = buildPromptWithMemoryContext(
    "You are a helpful assistant.",
    summary
  );
  assert(
    promptWithMemory.includes("<background_context>"),
    "System prompt properly injects background_context block"
  );

  // --- Test 3: Checkpointer Initialization ---
  console.log("\n=== Test 3: LangGraph Checkpointer Factory ===");
  const checkpointer = await getCheckpointer();
  assert(checkpointer !== null && checkpointer !== undefined, "Checkpointer successfully resolved");
  assert(typeof isDatabaseConnected() === "boolean", "isDatabaseConnected returns boolean");

  // --- Test 4: Thread CRUD & Memory Synchronization ====
  console.log("\n=== Test 4: Thread CRUD & Memory Synchronization ====");
  const testThreadId = `test-mem-${Date.now()}`;
  const touched = touchThread(testThreadId, "How do I optimize SQL queries?");
  assert(touched.id === testThreadId, "Thread created with expected ID");
  assert(touched.title.includes("How do I optimize SQL queries"), "Thread title extracted from prompt");

  const threadsList = await listThreads();
  assert(threadsList.some((t) => t.id === testThreadId), "Thread found in listThreads()");

  const fetchedThread = await getThread(testThreadId);
  assert(fetchedThread?.id === testThreadId, "getThread() returns thread metadata");

  const deleted = await deleteThread(testThreadId);
  assert(deleted === true, "deleteThread() successfully removed thread");

  // --- Test 5: HITL Pending Confirmation Store ---
  console.log("\n=== Test 5: HITL Pending Confirmation Store ===");
  const testConfirmation = await createPendingConfirmation({
    threadId: "test-thread-conf",
    toolName: "delete_database",
    toolArgs: { database: "production" },
    riskLevel: ToolRiskLevel.DESTRUCTIVE,
    description: "Delete the production PostgreSQL database instance",
  });
  assert(!!testConfirmation.id, "Confirmation created with UUID");
  assert(testConfirmation.status === "PENDING", "Initial status is PENDING");
  assert(testConfirmation.riskLevel === "DESTRUCTIVE", "Risk level is DESTRUCTIVE");

  const pendingList = await listPendingConfirmations("test-thread-conf");
  assert(pendingList.some((c) => c.id === testConfirmation.id), "Confirmation found in listPendingConfirmations");

  const resolved = await resolvePendingConfirmation(testConfirmation.id, "APPROVED");
  assert(resolved !== null, "resolvePendingConfirmation returned updated confirmation");
  assert(resolved?.status === "APPROVED", "Resolved status is APPROVED");
  assert(!!resolved?.resolvedAt, "resolvedAt timestamp is recorded");

  console.log("\n============================================================");
  console.log(`  Results: ${passedCount} passed, ${failedCount} failed`);
  console.log("============================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
