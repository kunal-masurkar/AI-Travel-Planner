import { Router } from "express";
import { handle } from "./handle.js";
import { z } from "zod";
import { googleLoginRequestSchema, loginRequestSchema, signupRequestSchema } from "@ai-travel-planner/shared";
import {
  createSession,
  hashPassword,
  newUserId,
  optionalAuth,
  rateLimit,
  requireAuth,
  revokeSession,
  toPublicUser,
  verifyGoogleCredential,
  verifyPassword,
} from "../auth/auth.js";
import { db, type UserRecord } from "../store/db.js";
import { sendWelcomeEmail } from "../services/email.js";

export const authRouter = Router();
const authLimiter = rateLimit(20, 10 * 60 * 1000);

authRouter.post("/signup", authLimiter, handle(async (request, response) => {
  const parsed = signupRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid sign-up details." });
  }
  const { name, email, password } = parsed.data;
  if (db.read((data) => data.users.some((user) => user.email === email))) {
    return response.status(409).json({ message: "An account with this email already exists. Try logging in." });
  }

  const user: UserRecord = {
    id: newUserId(),
    name,
    email,
    provider: "password",
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    recentDestinations: [],
  };
  await db.mutate((data) => {
    data.users.push(user);
  });
  const token = await createSession(user.id);
  // Send welcome email in background using Resend
  void sendWelcomeEmail(user.email, user.name).catch((err) => {
    console.error("[Auth] Welcome email failed:", err);
  });
  return response.status(201).json({ token, user: toPublicUser(user) });
}));

authRouter.post("/login", authLimiter, handle(async (request, response) => {
  const parsed = loginRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Enter a valid email and password." });
  }
  const user = db.read((data) => data.users.find((entry) => entry.email === parsed.data.email));
  const valid = user?.passwordHash ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    const hint = user && !user.passwordHash ? " This account uses Google sign-in." : "";
    return response.status(401).json({ message: `Incorrect email or password.${hint}` });
  }
  const token = await createSession(user.id);
  return response.json({ token, user: toPublicUser(user) });
}));

authRouter.post("/google", authLimiter, handle(async (request, response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return response.status(501).json({ message: "Google sign-in isn't configured on this server." });
  }
  const parsed = googleLoginRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Missing Google credential." });
  }
  const profile = await verifyGoogleCredential(parsed.data.credential, clientId);
  if (!profile) {
    return response.status(401).json({ message: "Google sign-in could not be verified. Please try again." });
  }

  let isNew = false;
  const user = await db.mutate((data) => {
    const existing = data.users.find((entry) => entry.googleSub === profile.sub || entry.email === profile.email);
    if (existing) {
      existing.googleSub ??= profile.sub;
      return existing;
    }
    isNew = true;
    const created: UserRecord = {
      id: newUserId(),
      name: profile.name,
      email: profile.email,
      provider: "google",
      googleSub: profile.sub,
      createdAt: new Date().toISOString(),
      recentDestinations: [],
    };
    data.users.push(created);
    return created;
  });
  if (isNew) {
    void sendWelcomeEmail(user.email, user.name).catch((err) => {
      console.error("[Auth] Welcome email failed for Google user:", err);
    });
  }
  const token = await createSession(user.id);
  return response.json({ token, user: toPublicUser(user) });
}));

authRouter.post("/logout", optionalAuth, handle(async (request, response) => {
  if (request.auth) await revokeSession(request.auth.token);
  return response.status(204).end();
}));

authRouter.get("/me", requireAuth, (request, response) => {
  const user = request.auth!.user;
  return response.json({ user: toPublicUser(user), recentDestinations: user.recentDestinations });
});

const recentSchema = z.object({ name: z.string().trim().min(1).max(80), key: z.string().max(40).nullable() });

authRouter.post("/me/recent", requireAuth, handle(async (request, response) => {
  const parsed = recentSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Invalid destination." });
  const userId = request.auth!.user.id;
  const recent = await db.mutate((data) => {
    const user = data.users.find((entry) => entry.id === userId)!;
    const label = parsed.data.name.toLowerCase();
    user.recentDestinations = [
      { ...parsed.data, viewedAt: new Date().toISOString() },
      ...user.recentDestinations.filter((entry) => entry.name.toLowerCase() !== label),
    ].slice(0, 8);
    return user.recentDestinations;
  });
  return response.json({ recentDestinations: recent });
}));
