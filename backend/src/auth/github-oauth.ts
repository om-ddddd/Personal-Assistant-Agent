import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "../..");
const tokensFilePath = path.join(backendDir, ".github-tokens.json");

dotenv.config({ path: path.join(backendDir, ".env") });

export interface GitHubTokens {
  access_token: string;
  token_type?: string;
  scope?: string;
  created_at?: string;
  user?: {
    login: string;
    name?: string;
    avatar_url?: string;
    html_url?: string;
    email?: string;
  };
}

let inMemoryTokens: GitHubTokens | null = null;

/**
 * Load stored GitHub tokens from disk or memory.
 */
export function loadStoredGitHubTokens(): GitHubTokens | null {
  if (inMemoryTokens) {
    return inMemoryTokens;
  }

  try {
    if (fs.existsSync(tokensFilePath)) {
      const data = fs.readFileSync(tokensFilePath, "utf-8");
      inMemoryTokens = JSON.parse(data);
      return inMemoryTokens;
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(`[GitHubOAuth] Error reading tokens file: ${error.message}`);
  }

  return null;
}

/**
 * Persist GitHub tokens to file and in-memory cache.
 */
export function saveStoredGitHubTokens(tokens: GitHubTokens): void {
  inMemoryTokens = {
    ...tokens,
    created_at: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(tokensFilePath, JSON.stringify(inMemoryTokens, null, 2), "utf-8");
    console.log("[GitHubOAuth] Tokens successfully saved to .github-tokens.json.");
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[GitHubOAuth] Failed to write tokens file: ${error.message}`);
  }
}

/**
 * Clear stored GitHub OAuth tokens (Disconnect).
 */
export function clearStoredGitHubTokens(): boolean {
  inMemoryTokens = null;
  try {
    if (fs.existsSync(tokensFilePath)) {
      fs.unlinkSync(tokensFilePath);
      console.log("[GitHubOAuth] .github-tokens.json removed.");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get active GitHub Access Token strictly using OAuth tokens.
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  const stored = loadStoredGitHubTokens();
  return stored?.access_token || null;
}

/**
 * Generates the GitHub OAuth2 authorization consent URL.
 */
export function getGitHubOAuthUrl(state: string = "github_auth_state"): string | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return null;
  }

  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || "http://localhost:5000/api/auth/github/callback";
  
  // Standard scopes for developer assistant (repos, workflows, user profile)
  const scopes = ["repo", "read:user", "user:email", "workflow"].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    allow_signup: "true",
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange OAuth authorization code for an Access Token.
 */
export async function exchangeGitHubCode(code: string): Promise<GitHubTokens> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || "http://localhost:5000/api/auth/github/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET in backend/.env.");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GitHub OAuth token exchange failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "Failed to obtain access token from GitHub");
  }

  // Fetch user profile details
  let userProfile: GitHubTokens["user"];
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Personal-Assistant-Agent",
      },
    });

    if (userRes.ok) {
      const u = (await userRes.json()) as any;
      userProfile = {
        login: u.login,
        name: u.name,
        avatar_url: u.avatar_url,
        html_url: u.html_url,
        email: u.email,
      };
    }
  } catch (err: unknown) {
    console.warn("[GitHubOAuth] Failed to fetch user profile details:", err);
  }

  const tokens: GitHubTokens = {
    access_token: data.access_token,
    token_type: data.token_type,
    scope: data.scope,
    user: userProfile,
  };

  saveStoredGitHubTokens(tokens);
  return tokens;
}

/**
 * Get comprehensive GitHub connection status.
 */
export async function getGitHubAuthStatus(): Promise<{
  connected: boolean;
  authMethod: "oauth" | "none";
  user?: GitHubTokens["user"];
  scopes?: string[];
}> {
  const stored = loadStoredGitHubTokens();
  if (stored?.access_token) {
    return {
      connected: true,
      authMethod: "oauth",
      user: stored.user,
      scopes: stored.scope ? stored.scope.split(",") : ["repo", "read:user"],
    };
  }

  return {
    connected: false,
    authMethod: "none",
  };
}
