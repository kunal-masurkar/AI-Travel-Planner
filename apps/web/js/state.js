// Client-side state: the signed-in user, recently viewed destinations and the guest draft trip.

import { api, getToken, setToken } from "./api.js";

const listeners = new Set();
const RECENT_KEY = "yatra.recent";
const DRAFT_KEY = "yatra.draft";

export const state = {
  user: null,
  recent: [],
  config: { googleClientId: null, livePlaces: false },
  destinations: [],
};

export function onStateChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener(state);
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export async function bootstrap() {
  const [config, destinations] = await Promise.all([
    api("/api/config").catch(() => state.config),
    api("/api/destinations").catch(() => ({ destinations: [] })),
  ]);
  state.config = config;
  state.destinations = destinations.destinations;
  state.recent = readJson(RECENT_KEY, []);

  if (getToken()) {
    try {
      const me = await api("/api/auth/me");
      state.user = me.user;
      if (me.recentDestinations?.length) state.recent = me.recentDestinations;
    } catch {
      state.user = null;
    }
  }
  emit();
}

export async function completeLogin({ token, user }) {
  setToken(token);
  state.user = user;
  try {
    const me = await api("/api/auth/me");
    // Merge guest history into the account so nothing is lost on sign-in.
    const guestRecent = readJson(RECENT_KEY, []);
    for (const entry of guestRecent.slice().reverse()) {
      if (!me.recentDestinations.some((item) => item.name.toLowerCase() === entry.name.toLowerCase())) {
        await api("/api/auth/me/recent", { method: "POST", body: { name: entry.name, key: entry.key ?? null } }).catch(() => {});
      }
    }
    const refreshed = await api("/api/auth/me");
    state.recent = refreshed.recentDestinations;
  } catch {
    /* non-critical */
  }
  emit();
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  setToken(null);
  state.user = null;
  state.recent = readJson(RECENT_KEY, []);
  emit();
}

export async function recordRecent(name, key = null) {
  const entry = { name, key, viewedAt: new Date().toISOString() };
  state.recent = [entry, ...state.recent.filter((item) => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 8);
  if (state.user) {
    const result = await api("/api/auth/me/recent", { method: "POST", body: { name, key } }).catch(() => null);
    if (result) state.recent = result.recentDestinations;
  } else {
    writeJson(RECENT_KEY, state.recent);
  }
}

export function saveDraft(draft) {
  writeJson(DRAFT_KEY, draft);
}

export function loadDraft() {
  return readJson(DRAFT_KEY, null);
}

export function clearDraft() {
  writeJson(DRAFT_KEY, null);
}

export function findCuratedKey(text) {
  const value = String(text ?? "").trim().toLowerCase();
  if (!value) return null;
  const match = state.destinations.find(
    (destination) =>
      destination.key === value ||
      destination.name.toLowerCase() === value ||
      value.includes(destination.key) ||
      value.includes(destination.name.toLowerCase()) ||
      (destination.aliases ?? []).some((alias) => value.includes(alias)),
  );
  return match?.key ?? null;
}
