import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Itinerary } from "@ai-travel-planner/shared";
import { hydrateFromSupabase, syncSnapshotToSupabase, isSupabaseConfigured } from "./supabase.js";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  provider: "password" | "google";
  passwordHash?: string | undefined;
  googleSub?: string | undefined;
  createdAt: string;
  recentDestinations: Array<{ name: string; key: string | null; viewedAt: string }>;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface TripRecord {
  id: string;
  userId: string;
  title: string;
  notes: string;
  itinerary: Itinerary;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseShape {
  users: UserRecord[];
  sessions: SessionRecord[];
  trips: TripRecord[];
}

const defaultDataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data");
const dataFile = join(process.env.DATA_DIR?.trim() || defaultDataDir, "db.json");

function load(): DatabaseShape {
  if (!existsSync(dataFile)) {
    return { users: [], sessions: [], trips: [] };
  }
  const parsed = JSON.parse(readFileSync(dataFile, "utf8")) as Partial<DatabaseShape>;
  return { users: parsed.users ?? [], sessions: parsed.sessions ?? [], trips: parsed.trips ?? [] };
}

/**
 * Hybrid Store:
 * Keeps state in memory for instant zero-latency reads.
 * Mutations are written atomically to disk AND synchronized with Supabase Postgres.
 * On server start, hydrates cloud state from Supabase when configured.
 */
class HybridStore {
  private data: DatabaseShape = load();
  private writeChain: Promise<void> = Promise.resolve();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (isSupabaseConfigured()) {
      const cloudData = await hydrateFromSupabase();
      if (cloudData) {
        this.data = cloudData;
        try {
          mkdirSync(dirname(dataFile), { recursive: true });
          const temp = `${dataFile}.${process.pid}.tmp`;
          await writeFile(temp, JSON.stringify(this.data, null, 2), "utf8");
          await rename(temp, dataFile);
        } catch (err) {
          console.warn("[Store] Could not write cloud snapshot to disk cache:", err);
        }
      }
    }
  }

  read<T>(selector: (data: DatabaseShape) => T): T {
    return selector(this.data);
  }

  async mutate<T>(mutator: (data: DatabaseShape) => T): Promise<T> {
    const result = mutator(this.data);
    const snapshot = JSON.stringify(this.data, null, 2);

    this.writeChain = this.writeChain.then(async () => {
      // 1. Atomic local file write
      mkdirSync(dirname(dataFile), { recursive: true });
      const temp = `${dataFile}.${process.pid}.tmp`;
      await writeFile(temp, snapshot, "utf8");
      await rename(temp, dataFile);

      // 2. Sync to Supabase Postgres
      if (isSupabaseConfigured()) {
        await syncSnapshotToSupabase(this.data);
      }
    });

    await this.writeChain;
    return result;
  }
}

export const db = new HybridStore();
export const databaseFile = dataFile;
