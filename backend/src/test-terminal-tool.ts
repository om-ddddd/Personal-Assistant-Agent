import {
  run_terminal_command,
  resolveSafeCwd,
  isDangerousCommand,
  sanitizeOutput,
  classifyTerminalCommand,
} from "./tools/terminal.js";
import { checkPermission } from "./permissions/registry.js";
import { runTerminalCommandTool } from "./tools/basic.js";
import path from "path";

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
  console.log("\n============================================================");
  console.log("  Safe Terminal Execution Tool (v0.9) Test Suite");
  console.log("============================================================\n");

  // --- Test 1: Safe Execution (node -v) ---
  console.log("=== Test 1: Safe Command Execution ===");
  const nodeVersionResult = await run_terminal_command({
    command: "node -v",
  });
  assert(nodeVersionResult.exitCode === 0, "node -v exited with code 0");
  assert(
    nodeVersionResult.stdout.includes("v") || nodeVersionResult.stdout.length > 0,
    `node -v output is valid (${nodeVersionResult.stdout.trim()})`
  );
  assert(typeof nodeVersionResult.durationMs === "number", "durationMs was recorded");

  // Verify subfolder execution
  const subfolderResult = await run_terminal_command({
    command: "node -v",
    cwd: "backend",
  });
  assert(subfolderResult.exitCode === 0, "Command executed inside 'backend' subfolder");
  assert(subfolderResult.cwd.includes("backend"), "Process cwd matches target directory");

  // --- Test 2: Workspace Boundary Enforcement ---
  console.log("\n=== Test 2: Workspace Boundary Enforcement ===");
  try {
    const insideBackend = resolveSafeCwd("backend");
    assert(insideBackend.includes("backend"), "Resolving 'backend' inside workspace succeeds");
  } catch (err: any) {
    assert(false, `Should not throw for valid subdirectory: ${err.message}`);
  }

  try {
    const insideFrontend = resolveSafeCwd("frontend");
    assert(insideFrontend.includes("frontend"), "Resolving 'frontend' inside workspace succeeds");
  } catch (err: any) {
    assert(false, `Should not throw for valid subdirectory: ${err.message}`);
  }

  let boundaryBlocked = false;
  try {
    resolveSafeCwd("../../Windows/System32");
  } catch (err: any) {
    boundaryBlocked = true;
    console.log(`  Boundary defense caught: "${err.message}"`);
  }
  assert(boundaryBlocked, "Directory traversal outside workspace root is blocked");

  // --- Test 3: Dangerous Command Denylist Blocking ---
  console.log("\n=== Test 3: Dangerous Command Denylist Blocking ===");
  const dangerousCommands = [
    "rm -rf /",
    "rmdir /s /q C:\\",
    "format D: /fs:NTFS",
    ":(){ :|:& };:",
    "shutdown /s /t 0",
  ];

  for (const cmd of dangerousCommands) {
    const check = isDangerousCommand(cmd);
    assert(check.blocked === true, `Dangerous command '${cmd}' was blocked before execution`);
  }

  // --- Test 4: Secret Sanitization & Redaction ---
  console.log("\n=== Test 4: Secret Scrubbing and Redaction ===");
  const rawLeak = "Connected to postgresql://postgres:SuperSecretPassword123@db.supabase.com:5432/postgres with token ghp_1234567890abcdefghijklmnopqrstuvwxyz";
  const sanitized = sanitizeOutput(rawLeak);

  assert(!sanitized.includes("SuperSecretPassword123"), "Database password redacted from output");
  assert(!sanitized.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyz"), "GitHub token redacted from output");
  assert(sanitized.includes("[REDACTED_DATABASE_URI]"), "Placeholder inserted for database URI");
  assert(sanitized.includes("[REDACTED_API_TOKEN]"), "Placeholder inserted for GitHub token");

  // --- Test 5: Dynamic Permission Classification ---
  console.log("\n=== Test 5: Dynamic Permission Classification ===");
  assert(classifyTerminalCommand("git status") === "READ", "git status is READ");
  assert(classifyTerminalCommand("git log -n 5") === "READ", "git log is READ");
  assert(classifyTerminalCommand("npm test") === "READ", "npm test is READ");
  assert(classifyTerminalCommand("npx tsc --noEmit") === "READ", "npx tsc --noEmit is READ");
  assert(classifyTerminalCommand("npm install axios") === "WRITE", "npm install is WRITE (needs confirmation)");
  assert(classifyTerminalCommand("git commit -m 'fix'") === "WRITE", "git commit is WRITE (needs confirmation)");
  assert(classifyTerminalCommand("git reset --hard HEAD~1") === "DESTRUCTIVE", "git reset --hard is DESTRUCTIVE");

  // Permission Registry Dynamic Evaluation
  const gitStatusDecision = checkPermission("run_terminal_command", { command: "git status" });
  assert(gitStatusDecision.riskLevel === "READ", "checkPermission returns READ for git status");
  assert(gitStatusDecision.requiresConfirmation === false, "git status does NOT require confirmation");

  const npmInstallDecision = checkPermission("run_terminal_command", { command: "npm install express" });
  assert(npmInstallDecision.riskLevel === "WRITE", "checkPermission returns WRITE for npm install");
  assert(npmInstallDecision.requiresConfirmation === true, "npm install REQUIRES confirmation");

  // --- Test 6: LangChain Structured Tool Integration ---
  console.log("\n=== Test 6: LangChain Tool Invocation ===");
  const toolResult = await runTerminalCommandTool.invoke({
    command: "node -e \"console.log('Tool execution verified');\"",
  });

  const parsed = JSON.parse(toolResult);
  assert(parsed.success === true, "run_terminal_command tool returned success: true");
  assert(parsed.stdout.includes("Tool execution verified"), "Tool output contains executed string");

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
