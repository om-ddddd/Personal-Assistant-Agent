import {
  getGitHubAccessToken,
  getGitHubOAuthUrl,
  getGitHubAuthStatus,
  saveStoredGitHubTokens,
  clearStoredGitHubTokens,
  loadStoredGitHubTokens,
  GitHubTokens,
} from "./auth/github-oauth.js";

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
  console.log("  GitHub OAuth (Strict - No PAT) Test Suite");
  console.log("============================================================\n");

  clearStoredGitHubTokens();

  // --- Test 1: Disconnected Status (Zero PAT Fallback) ---
  console.log("=== Test 1: Disconnected Status (Zero PAT Fallback) ===");
  const initialToken = await getGitHubAccessToken();
  assert(initialToken === null, "getGitHubAccessToken returns null when not logged in via OAuth");

  const initialStatus = await getGitHubAuthStatus();
  assert(initialStatus.connected === false, "getGitHubAuthStatus returns connected: false");
  assert(initialStatus.authMethod === "none", "authMethod is 'none'");

  // --- Test 2: OAuth URL Generation ---
  console.log("\n=== Test 2: OAuth URL Generation ===");
  process.env.GITHUB_CLIENT_ID = "mock_client_id_12345";
  const authUrl = getGitHubOAuthUrl("test_state_abc");
  assert(authUrl !== null, "OAuth URL generated successfully");
  assert(authUrl!.includes("github.com/login/oauth/authorize"), "URL points to GitHub OAuth authorize endpoint");
  assert(authUrl!.includes("client_id=mock_client_id_12345"), "URL contains client_id");
  assert(authUrl!.includes("scope=repo+read%3Auser+user%3Aemail+workflow"), "URL contains requested scopes");

  // --- Test 3: OAuth Token Persistence & Lifecycle ---
  console.log("\n=== Test 3: Token Persistence & Disconnect Lifecycle ===");
  const mockTokens: GitHubTokens = {
    access_token: "gho_mock_oauth_token_67890",
    token_type: "bearer",
    scope: "repo,read:user,user:email",
    user: {
      login: "developer-om",
      name: "Om Developer",
      avatar_url: "https://avatars.githubusercontent.com/u/123456",
      html_url: "https://github.com/developer-om",
    },
  };

  saveStoredGitHubTokens(mockTokens);
  const loaded = loadStoredGitHubTokens();
  assert(loaded?.access_token === "gho_mock_oauth_token_67890", "Tokens saved and reloaded from storage");
  assert(loaded?.user?.login === "developer-om", "User profile persisted in token metadata");

  const activeToken = await getGitHubAccessToken();
  assert(activeToken === "gho_mock_oauth_token_67890", "getGitHubAccessToken returns OAuth token");

  const oauthStatus = await getGitHubAuthStatus();
  assert(oauthStatus.connected === true, "getGitHubAuthStatus returns connected: true");
  assert(oauthStatus.authMethod === "oauth", "authMethod identified as 'oauth'");
  assert(oauthStatus.user?.login === "developer-om", "Connected user returned in status");

  const disconnected = clearStoredGitHubTokens();
  assert(disconnected === true, "clearStoredGitHubTokens removed token file");

  const afterDisconnectToken = await getGitHubAccessToken();
  assert(afterDisconnectToken === null, "After disconnect, getGitHubAccessToken returns null");

  const afterDisconnectStatus = await getGitHubAuthStatus();
  assert(afterDisconnectStatus.connected === false, "After disconnect, connected is false");
  assert(afterDisconnectStatus.authMethod === "none", "After disconnect, authMethod is 'none'");

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
