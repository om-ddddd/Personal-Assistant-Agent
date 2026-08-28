export interface GitHubUser {
  login: string;
  name?: string;
  avatar_url?: string;
  html_url?: string;
  email?: string;
}

export interface GitHubAuthStatus {
  connected: boolean;
  authMethod: "oauth" | "personal_access_token" | "none";
  user?: GitHubUser;
  scopes?: string[];
}

export interface GoogleAuthStatus {
  configured: boolean;
  mode: "live" | "sandbox";
  hasClientId: boolean;
  hasClientSecret: boolean;
  email?: string;
}

export interface OAuthUrlResponse {
  url: string | null;
  configured: boolean;
  redirectUri: string;
}

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

/**
 * Fetch GitHub OAuth status
 */
export async function fetchGitHubStatus(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<GitHubAuthStatus> {
  try {
    const res = await fetch(`${backendUrl}/api/auth/github/status`);
    if (!res.ok) {
      return { connected: false, authMethod: "none" };
    }
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch GitHub auth status:", err);
    return { connected: false, authMethod: "none" };
  }
}

/**
 * Fetch GitHub OAuth URL for login redirect
 */
export async function fetchGitHubOAuthUrl(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<OAuthUrlResponse> {
  try {
    const res = await fetch(`${backendUrl}/api/auth/github/url`);
    if (!res.ok) {
      return { url: null, configured: false, redirectUri: "" };
    }
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch GitHub OAuth URL:", err);
    return { url: null, configured: false, redirectUri: "" };
  }
}

/**
 * Disconnect GitHub OAuth session
 */
export async function disconnectGitHub(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}/api/auth/github/disconnect`, {
      method: "POST",
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to disconnect GitHub:", err);
    return false;
  }
}

/**
 * Fetch Google Workspace OAuth status
 */
export async function fetchGoogleStatus(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<GoogleAuthStatus> {
  try {
    const res = await fetch(`${backendUrl}/api/auth/google/status`);
    if (!res.ok) {
      return {
        configured: false,
        mode: "sandbox",
        hasClientId: false,
        hasClientSecret: false,
      };
    }
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch Google auth status:", err);
    return {
      configured: false,
      mode: "sandbox",
      hasClientId: false,
      hasClientSecret: false,
    };
  }
}

/**
 * Fetch Google OAuth URL for login redirect
 */
export async function fetchGoogleOAuthUrl(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<OAuthUrlResponse> {
  try {
    const res = await fetch(`${backendUrl}/api/auth/google/url`);
    if (!res.ok) {
      return { url: null, configured: false, redirectUri: "" };
    }
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch Google OAuth URL:", err);
    return { url: null, configured: false, redirectUri: "" };
  }
}

/**
 * Disconnect Google Workspace OAuth session
 */
export async function disconnectGoogle(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}/api/auth/google/disconnect`, {
      method: "POST",
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to disconnect Google:", err);
    return false;
  }
}
