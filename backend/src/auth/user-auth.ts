import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma, isDatabaseConnected } from "../db/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "dev-assistant-jwt-secret-key-2026";
const JWT_EXPIRES_IN = "7d";

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: UserProfile;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory fallback user cache
const inMemoryUserStore = new Map<string, UserRecord>();

/**
 * Sign up a new user with bcrypt password hashing
 */
export async function signUpUser(
  emailInput: string,
  passwordInput: string,
  nameInput?: string
): Promise<AuthResult> {
  const email = emailInput?.trim().toLowerCase();
  const password = passwordInput?.trim();
  const name = nameInput?.trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email address format.");
  }

  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  // 1. Check if user already exists
  let existingUser: UserRecord | null = null;

  if (isDatabaseConnected()) {
    try {
      const dbUser = await (prisma as any).user.findUnique({
        where: { email },
      });
      if (dbUser) {
        existingUser = dbUser;
      }
    } catch {
      // fallback to memory
    }
  }

  if (!existingUser) {
    for (const u of inMemoryUserStore.values()) {
      if (u.email === email) {
        existingUser = u;
        break;
      }
    }
  }

  if (existingUser) {
    throw new Error("An account with this email already exists.");
  }

  // 2. Hash password with bcrypt
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // 3. Create user record
  const userId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  let createdUser: UserRecord = {
    id: userId,
    email,
    passwordHash,
    name,
    createdAt: now,
    updatedAt: now,
  };

  if (isDatabaseConnected()) {
    try {
      const dbCreated = await (prisma as any).user.create({
        data: {
          id: userId,
          email,
          passwordHash,
          name,
        },
      });
      createdUser = dbCreated;
    } catch (err: unknown) {
      console.warn("[UserAuth] Database insert failed, storing in memory:", err);
    }
  }

  // Cache in memory
  inMemoryUserStore.set(createdUser.id, createdUser);

  // 4. Generate JWT token
  const token = jwt.sign(
    {
      userId: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      createdAt: createdUser.createdAt.toISOString(),
    },
  };
}

/**
 * Log in an existing user with bcrypt password comparison
 */
export async function loginUser(
  emailInput: string,
  passwordInput: string
): Promise<AuthResult> {
  const email = emailInput?.trim().toLowerCase();
  const password = passwordInput?.trim();

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  // 1. Find user by email
  let user: UserRecord | null = null;

  if (isDatabaseConnected()) {
    try {
      const dbUser = await (prisma as any).user.findUnique({
        where: { email },
      });
      if (dbUser) {
        user = dbUser;
      }
    } catch {
      // fallback
    }
  }

  if (!user) {
    for (const u of inMemoryUserStore.values()) {
      if (u.email === email) {
        user = u;
        break;
      }
    }
  }

  if (!user) {
    throw new Error("Invalid email or password.");
  }

  // 2. Compare password with bcrypt
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Invalid email or password.");
  }

  // 3. Generate JWT token
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

/**
 * Verify JWT token and return decoded payload
 */
export function verifyAuthToken(token: string): {
  userId: string;
  email: string;
  name?: string | null;
} {
  try {
    const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
    const decoded = jwt.verify(cleanToken, JWT_SECRET) as {
      userId: string;
      email: string;
      name?: string | null;
    };
    return decoded;
  } catch {
    throw new Error("Invalid or expired authentication token.");
  }
}

/**
 * Get user profile by user ID
 */
export async function getUserById(id: string): Promise<UserProfile | null> {
  if (isDatabaseConnected()) {
    try {
      const dbUser = await (prisma as any).user.findUnique({
        where: { id },
      });
      if (dbUser) {
        return {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          createdAt: dbUser.createdAt.toISOString(),
        };
      }
    } catch {
      // fallback
    }
  }

  const cached = inMemoryUserStore.get(id);
  if (cached) {
    return {
      id: cached.id,
      email: cached.email,
      name: cached.name,
      createdAt: cached.createdAt.toISOString(),
    };
  }

  return null;
}
