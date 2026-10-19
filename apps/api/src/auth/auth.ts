import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "@ai-travel-planner/shared";
import { db, type UserRecord } from "../store/db.js";
import { checkRateLimit } from "../store/redis.js";
import { deleteSessionInSupabase } from "../store/supabase.js";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltText, hashText] = stored.split(":");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64");
  const derived = await scrypt(password, Buffer.from(saltText, "base64"), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.mutate((data) => {
    // Drop expired sessions while we are writing anyway.
    data.sessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > now);
    data.sessions.push({
      tokenHash: hashToken(token),
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + sessionTtlMs).toISOString(),
    });
  });
  return token;
}

export async function revokeSession(token: string) {
  const tokenHash = hashToken(token);
  await db.mutate((data) => {
    data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
  });
  await deleteSessionInSupabase(tokenHash);
}

export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, name: user.name, email: user.email, provider: user.provider, createdAt: user.createdAt };
}

export function newUserId() {
  return randomUUID();
}

function bearerToken(request: Request) {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export function userForRequest(request: Request): { user: UserRecord; token: string } | null {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = hashToken(token);
  return db.read((data) => {
    const session = data.sessions.find((entry) => entry.tokenHash === tokenHash);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = data.users.find((entry) => entry.id === session.userId);
    return user ? { user, token } : null;
  });
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: { user: UserRecord; token: string } | null;
  }
}

/** Attaches `request.auth` when a valid session token is present; never rejects. */
export function optionalAuth(request: Request, _response: Response, next: NextFunction) {
  request.auth = userForRequest(request);
  next();
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  request.auth = userForRequest(request);
  if (!request.auth) {
    response.status(401).json({ message: "Please log in to continue." });
    return;
  }
  next();
}

/** Rate limiter backed by Redis with in-memory fallback. */
export function rateLimit(limit: number, windowMs: number) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const key = request.ip ?? "unknown";
    try {
      const result = await checkRateLimit(key, limit, windowMs);
      response.setHeader("X-RateLimit-Limit", limit);
      response.setHeader("X-RateLimit-Remaining", result.remaining);
      response.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        response.status(429).json({ message: "Too many attempts. Please wait a few minutes and try again." });
        return;
      }
      next();
    } catch {
      // If any unexpected error occurs, fail-open so legitimate users aren't locked out
      next();
    }
  };
}

type GoogleTokenInfo = { aud?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; exp?: string };

/** Verifies a Google Identity Services ID token via Google's tokeninfo endpoint. */
export async function verifyGoogleCredential(credential: string, clientId: string) {
  const url = new URL("https://oauth2.googleapis.com/tokeninfo");
  url.searchParams.set("id_token", credential);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const info = (await response.json()) as GoogleTokenInfo;
  const verified = info.email_verified === true || info.email_verified === "true";
  if (info.aud !== clientId || !info.sub || !info.email || !verified) return null;
  if (info.exp && Number(info.exp) * 1000 < Date.now()) return null;
  return { sub: info.sub, email: info.email.toLowerCase(), name: info.name ?? info.email.split("@")[0]! };
}
