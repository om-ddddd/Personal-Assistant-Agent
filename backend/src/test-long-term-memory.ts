import { generateNimEmbedding } from "./memory/embeddings.js";
import {
  initPgVectorSchema,
  saveMemory,
  recallMemories,
  forgetMemory,
  listAllMemories,
} from "./memory/long-term.js";
import {
  saveMemoryTool,
  recallMemoriesTool,
  forgetMemoryTool,
} from "./tools/memory-tools.js";
import { checkDatabaseConnection, isDatabaseConnected } from "./db/prisma.js";

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
  console.log("  Long-Term Memory (pgvector + NVIDIA Embeddings) Tests");
  console.log("============================================================\n");

  // --- Test 1: NVIDIA NIM Embeddings ---
  console.log("=== Test 1: NVIDIA NIM Embedding Generation ===");
  const testText = "The user prefers dark mode and concise TypeScript code.";
  const embedding = await generateNimEmbedding(testText, "passage");
  assert(Array.isArray(embedding), "Embedding returned as array");
  assert(embedding.length === 2048, `Embedding dimension is 2048 (got ${embedding.length})`);
  assert(embedding.some((v) => v !== 0), "Embedding contains non-zero float values");

  const queryEmbedding = await generateNimEmbedding("TypeScript preferences", "query");
  assert(queryEmbedding.length === 2048, "Query embedding matches expected dimension");

  // --- Test 2: Schema Initialization ---
  console.log("\n=== Test 2: pgvector Schema Initialization ===");
  const initialized = await initPgVectorSchema();
  assert(typeof initialized === "boolean", "initPgVectorSchema returned boolean status");
  console.log(`  PostgreSQL pgvector status: ${isDatabaseConnected() ? "Live Connected" : "In-Memory Fallback"}`);

  // --- Test 3: Memory Storage & Semantic Similarity Search ---
  console.log("\n=== Test 3: Save & Semantic Similarity Vector Search ===");
  const mem1 = await saveMemory(
    "User timezone is Asia/Kolkata (IST, UTC+5:30) and works from Mumbai.",
    "preference",
    "default_user"
  );
  assert(!!mem1.id, "Saved timezone memory with ID");

  const mem2 = await saveMemory(
    "Primary backend stack is Node.js, Express, LangGraph, and Supabase PostgreSQL.",
    "project_fact",
    "default_user"
  );
  assert(!!mem2.id, "Saved backend stack memory with ID");

  const mem3 = await saveMemory(
    "Preferred UI styling library is Tailwind CSS with custom glassmorphism effects.",
    "preference",
    "default_user"
  );
  assert(!!mem3.id, "Saved styling memory with ID");

  // Semantic query
  const searchResults = await recallMemories("Which database and server framework do we use?", 2);
  assert(searchResults.length >= 1, `Search returned ${searchResults.length} relevant memories`);
  if (searchResults.length > 0) {
    console.log(`  Top semantic match: "${searchResults[0].content}" (similarity: ${searchResults[0].similarity?.toFixed(3)})`);
    assert(
      searchResults[0].content.includes("Node.js") || searchResults[0].content.includes("PostgreSQL"),
      "Semantic search matched the relevant backend stack memory"
    );
  }

  // --- Test 4: LangChain Memory Tools ---
  console.log("\n=== Test 4: Agent Memory Tools Execution ===");
  const saveToolRes = await saveMemoryTool.invoke({
    content: "User always writes code with detailed comments and zero emojis.",
    category: "instruction",
    tags: ["coding_style", "emojis"],
  });
  const parsedSave = JSON.parse(saveToolRes);
  assert(parsedSave.success === true, "save_memory tool returned success");
  assert(!!parsedSave.memoryId, "save_memory tool returned memoryId");

  const recallToolRes = await recallMemoriesTool.invoke({
    query: "Do we allow emojis in code or replies?",
  });
  const parsedRecall = JSON.parse(recallToolRes);
  assert(parsedRecall.count > 0, "recall_memories tool found matching memory");
  assert(
    parsedRecall.memories.some((m: any) => m.content.includes("zero emojis")),
    "recall_memories matched the emoji instruction memory"
  );

  const forgetToolRes = await forgetMemoryTool.invoke({
    memoryId: parsedSave.memoryId,
  });
  const parsedForget = JSON.parse(forgetToolRes);
  assert(parsedForget.success === true, "forget_memory tool successfully deleted memory");

  // --- Test 5: Cross-Thread Recall & Deduplication ---
  console.log("\n=== Test 5: Cross-Thread Memory Recall in Agent ===");
  const allMems = await listAllMemories();
  assert(allMems.length >= 3, `listAllMemories returned ${allMems.length} stored memories`);

  console.log("\n=== Test 6: Memory Deduplication (Exact & Semantic) ===");
  const dup1 = await saveMemory(
    "User timezone is Asia/Kolkata (IST, UTC+5:30) and works from Mumbai.",
    "preference"
  );
  assert(dup1.id === mem1.id, "Exact duplicate returned existing memory ID without inserting new row");
  const countAfterExact = (await listAllMemories()).length;
  assert(countAfterExact === allMems.length, `Total row count remained unchanged (${countAfterExact}) after exact duplicate`);

  const dup2 = await saveMemory(
    "The user is in Asia/Kolkata timezone (UTC+5:30) based in Mumbai.",
    "preference"
  );
  assert(dup2.id === mem1.id, "Semantic near-duplicate updated existing record instead of creating duplicate");
  const countAfterSemantic = (await listAllMemories()).length;
  assert(countAfterSemantic === allMems.length, `Total row count remained unchanged (${countAfterSemantic}) after semantic duplicate`);

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
