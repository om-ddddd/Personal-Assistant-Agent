export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const TOKEN_KEY = "assistant_auth_token";
const USER_KEY = "assistant_auth_user";

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Sign up a new user account
 */
export async function apiSignUp(
  email: string,
  password: string,
  name?: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<AuthResponse> {
  const res = await fetch(`${backendUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Sign up failed.");
  }

  setStoredAuthToken(data.token);
  setStoredUser(data.user);
  return data;
}

/**
 * Log in an existing user
 */
export async function apiLogin(
  email: string,
  password: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<AuthResponse> {
  const res = await fetch(`${backendUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Login failed.");
  }

  setStoredAuthToken(data.token);
  setStoredUser(data.user);
  return data;
}

/**
 * Fetch current user profile with stored token
 */
export async function apiGetMe(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<UserProfile | null> {
  const token = getStoredAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${backendUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      clearStoredAuth();
      return null;
    }

    const data = await res.json();
    if (data.user) {
      setStoredUser(data.user);
      return data.user;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Log out user
 */
export async function apiLogout(
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<void> {
  try {
    await fetch(`${backendUrl}/api/auth/logout`, { method: "POST" });
  } catch {
    // ignore
  }
  clearStoredAuth();
}
