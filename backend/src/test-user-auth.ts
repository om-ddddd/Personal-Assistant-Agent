import {
  signUpUser,
  loginUser,
  verifyAuthToken,
  getUserById,
} from "./auth/user-auth.js";

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
  console.log("  User Authentication (Bcrypt + JWT) Test Suite");
  console.log("============================================================\n");

  const testEmail = `developer_${Date.now()}@example.com`;
  const testPassword = "SuperSecurePassword123!";
  const testName = "Alex Dev";

  // --- Test 1: Sign Up with Valid Credentials ---
  console.log("=== Test 1: User Sign Up with Bcrypt Hashing ===");
  const signupResult = await signUpUser(testEmail, testPassword, testName);
  assert(!!signupResult.token, "JWT token returned on signup");
  assert(signupResult.user.email === testEmail.toLowerCase(), "User email matches (normalized lowercase)");
  assert(signupResult.user.name === testName, "User name matches");
  assert(!!signupResult.user.id, "User ID generated");
  assert(!!signupResult.user.createdAt, "Creation timestamp generated");

  // --- Test 2: Validation Guards ---
  console.log("\n=== Test 2: Input Validation Guards ===");
  let invalidEmailBlocked = false;
  try {
    await signUpUser("invalid-email-string", testPassword);
  } catch {
    invalidEmailBlocked = true;
  }
  assert(invalidEmailBlocked, "Invalid email format was rejected");

  let shortPasswordBlocked = false;
  try {
    await signUpUser(`user_${Date.now()}@test.com`, "123");
  } catch {
    shortPasswordBlocked = true;
  }
  assert(shortPasswordBlocked, "Short password (< 6 chars) was rejected");

  let duplicateBlocked = false;
  try {
    await signUpUser(testEmail, "AnotherPassword456!");
  } catch {
    duplicateBlocked = true;
  }
  assert(duplicateBlocked, "Duplicate email registration was blocked");

  // --- Test 3: Login with Bcrypt Password Comparison ---
  console.log("\n=== Test 3: User Login with Bcrypt Verification ===");
  const loginResult = await loginUser(testEmail, testPassword);
  assert(!!loginResult.token, "JWT token returned on successful login");
  assert(loginResult.user.id === signupResult.user.id, "User ID matches registered account");
  assert(loginResult.user.email === testEmail.toLowerCase(), "Logged-in user email verified");

  let wrongPasswordBlocked = false;
  try {
    await loginUser(testEmail, "WrongPassword999!");
  } catch {
    wrongPasswordBlocked = true;
  }
  assert(wrongPasswordBlocked, "Incorrect password was rejected with error");

  let nonExistentUserBlocked = false;
  try {
    await loginUser("nonexistent_user@example.com", testPassword);
  } catch {
    nonExistentUserBlocked = true;
  }
  assert(nonExistentUserBlocked, "Non-existent user login was rejected with error");

  // --- Test 4: JWT Token Verification & User Profile ---
  console.log("\n=== Test 4: JWT Verification and Profile Retrieval ===");
  const decoded = verifyAuthToken(loginResult.token);
  assert(decoded.userId === signupResult.user.id, "Decoded token contains correct userId");
  assert(decoded.email === testEmail.toLowerCase(), "Decoded token contains correct email");

  const bearerDecoded = verifyAuthToken(`Bearer ${loginResult.token}`);
  assert(bearerDecoded.userId === signupResult.user.id, "Bearer prefix handled in verifyAuthToken");

  let tamperedTokenBlocked = false;
  try {
    verifyAuthToken(loginResult.token + "tampered");
  } catch {
    tamperedTokenBlocked = true;
  }
  assert(tamperedTokenBlocked, "Tampered/invalid JWT token was rejected");

  const fetchedUser = await getUserById(signupResult.user.id);
  assert(fetchedUser !== null, "User profile retrieved by ID");
  assert(fetchedUser?.email === testEmail.toLowerCase(), "Fetched user email matches");
  assert(!("passwordHash" in (fetchedUser as any)), "passwordHash is never exposed in UserProfile");

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
