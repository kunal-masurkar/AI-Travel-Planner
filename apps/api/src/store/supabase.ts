import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserRecord, SessionRecord, TripRecord, DatabaseShape } from "./db.js";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })
    : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// Type definitions matching the Supabase SQL schema
interface SupabaseUserRow {
  id: string;
  email: string;
  name: string;
  provider: "password" | "google";
  password_hash: string | null;
  google_sub: string | null;
  recent_destinations: Array<{ name: string; key: string | null; viewedAt: string }> | null;
  created_at: string;
}

interface SupabaseSessionRow {
  token_hash: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

interface SupabaseTripRow {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  itinerary: any;
  preferences: any;
  created_at: string;
  updated_at: string;
}

export function userToRow(user: UserRecord): SupabaseUserRow {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    password_hash: user.passwordHash ?? null,
    google_sub: user.googleSub ?? null,
    recent_destinations: user.recentDestinations ?? [],
    created_at: user.createdAt,
  };
}

export function rowToUser(row: SupabaseUserRow): UserRecord {
  const user: UserRecord = {
    id: row.id,
    email: row.email,
    name: row.name,
    provider: row.provider,
    recentDestinations: row.recent_destinations ?? [],
    createdAt: row.created_at,
  };
  if (row.password_hash) user.passwordHash = row.password_hash;
  if (row.google_sub) user.googleSub = row.google_sub;
  return user;
}

export function sessionToRow(session: SessionRecord): SupabaseSessionRow {
  return {
    token_hash: session.tokenHash,
    user_id: session.userId,
    created_at: session.createdAt,
    expires_at: session.expiresAt,
  };
}

export function rowToSession(row: SupabaseSessionRow): SessionRecord {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function tripToRow(trip: TripRecord): SupabaseTripRow {
  return {
    id: trip.id,
    user_id: trip.userId,
    title: trip.title,
    notes: trip.notes,
    itinerary: trip.itinerary,
    preferences: trip.preferences,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
  };
}

export function rowToTrip(row: SupabaseTripRow): TripRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    notes: row.notes ?? "",
    itinerary: row.itinerary,
    preferences: row.preferences ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Hydrates full database state from Supabase on startup.
 */
export async function hydrateFromSupabase(): Promise<DatabaseShape | null> {
  if (!supabase) return null;

  try {
    const [usersRes, sessionsRes, tripsRes] = await Promise.all([
      supabase.from("users").select("*"),
      supabase.from("sessions").select("*"),
      supabase.from("trips").select("*"),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (sessionsRes.error) throw sessionsRes.error;
    if (tripsRes.error) throw tripsRes.error;

    const users = (usersRes.data as SupabaseUserRow[]).map(rowToUser);
    const sessions = (sessionsRes.data as SupabaseSessionRow[]).map(rowToSession);
    const trips = (tripsRes.data as SupabaseTripRow[]).map(rowToTrip);

    console.log(
      `[Supabase] Connected to Postgres: Hydrated ${users.length} users, ${sessions.length} sessions, ${trips.length} trips.`
    );

    return { users, sessions, trips };
  } catch (err) {
    console.warn("[Supabase] Failed to hydrate database from Supabase, falling back to local store:", err);
    return null;
  }
}

/**
 * Upserts a user in Supabase.
 */
export async function upsertUserInSupabase(user: UserRecord): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("users").upsert(userToRow(user));
  if (error) console.error("[Supabase] Failed to upsert user:", error.message);
}

/**
 * Upserts a session in Supabase.
 */
export async function upsertSessionInSupabase(session: SessionRecord): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("sessions").upsert(sessionToRow(session));
  if (error) console.error("[Supabase] Failed to upsert session:", error.message);
}

/**
 * Deletes a session by token hash in Supabase.
 */
export async function deleteSessionInSupabase(tokenHash: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("sessions").delete().eq("token_hash", tokenHash);
  if (error) console.error("[Supabase] Failed to delete session:", error.message);
}

/**
 * Upserts a trip in Supabase.
 */
export async function upsertTripInSupabase(trip: TripRecord): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("trips").upsert(tripToRow(trip));
  if (error) console.error("[Supabase] Failed to upsert trip:", error.message);
}

/**
 * Deletes a trip in Supabase.
 */
export async function deleteTripInSupabase(tripId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("trips").delete().eq("id", tripId).eq("user_id", userId);
  if (error) console.error("[Supabase] Failed to delete trip:", error.message);
}

/**
 * Synchronizes full snapshot to Supabase (handles reconciliation).
 */
export async function syncSnapshotToSupabase(data: DatabaseShape): Promise<void> {
  if (!supabase) return;

  try {
    const userRows = data.users.map(userToRow);
    const sessionRows = data.sessions.map(sessionToRow);
    const tripRows = data.trips.map(tripToRow);

    if (userRows.length > 0) {
      await supabase.from("users").upsert(userRows);
    }
    if (sessionRows.length > 0) {
      await supabase.from("sessions").upsert(sessionRows);
    }
    if (tripRows.length > 0) {
      await supabase.from("trips").upsert(tripRows);
    }
  } catch (err) {
    console.error("[Supabase] Sync snapshot error:", err);
  }
}
