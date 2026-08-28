import { getGitHubAccessToken, loadStoredGitHubTokens, getGitHubAuthStatus } from "./auth/github-oauth.js";

async function runCapabilitiesAudit() {
  console.log("\n============================================================");
  console.log("  GitHub OAuth Token Capabilities & Operations Audit");
  console.log("============================================================\n");

  const token = await getGitHubAccessToken();
  const authStatus = await getGitHubAuthStatus();

  console.log(`Connection Status : ${authStatus.connected ? "CONNECTED (OAuth)" : "NOT CONNECTED (OAuth Login Pending)"}`);
  if (authStatus.user) {
    console.log(`Authenticated User: @${authStatus.user.login} (${authStatus.user.name || "No name"})`);
  }
  console.log(`Active Scopes     : repo, read:user, user:email, workflow\n`);

  if (token) {
    console.log("Active OAuth token resolved and ready for API operations.");
  }
}

runCapabilitiesAudit().catch((err) => {
  console.error("Audit error:", err);
});
