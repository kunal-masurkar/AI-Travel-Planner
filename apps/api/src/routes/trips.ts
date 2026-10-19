import { randomUUID } from "node:crypto";
import { Router } from "express";
import { handle } from "./handle.js";
import {
  saveTripRequestSchema,
  updateTripRequestSchema,
  type Itinerary,
  type SavedTrip,
  type SavedTripSummary,
  type TripStatus,
} from "@ai-travel-planner/shared";
import { requireAuth } from "../auth/auth.js";
import { db, type TripRecord } from "../store/db.js";
import { deleteTripInSupabase } from "../store/supabase.js";

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusOf(itinerary: Itinerary): TripStatus {
  const today = todayIso();
  if (itinerary.endDate < today) return "past";
  if (itinerary.startDate <= today) return "ongoing";
  return "upcoming";
}

function toSummary(trip: TripRecord): SavedTripSummary {
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.itinerary.destination,
    destinationKey: trip.itinerary.destinationKey ?? null,
    startDate: trip.itinerary.startDate,
    endDate: trip.itinerary.endDate,
    days: trip.itinerary.days.length,
    travelers: trip.itinerary.travelers,
    totalCostInr: trip.itinerary.costBreakdown?.total ?? trip.itinerary.budgetEstimateInr,
    status: statusOf(trip.itinerary),
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

function toSavedTrip(trip: TripRecord): SavedTrip {
  return { ...toSummary(trip), notes: trip.notes, itinerary: trip.itinerary, preferences: trip.preferences };
}

export async function saveTripForUser(
  userId: string,
  itinerary: Itinerary,
  options: { title?: string | undefined; notes?: string | undefined; preferences?: Record<string, unknown> | undefined } = {},
) {
  const now = new Date().toISOString();
  const record: TripRecord = {
    id: randomUUID(),
    userId,
    title: options.title ?? itinerary.tripTitle,
    notes: options.notes ?? "",
    itinerary,
    preferences: options.preferences ?? {},
    createdAt: now,
    updatedAt: now,
  };
  await db.mutate((data) => {
    data.trips.push(record);
  });
  return record;
}

function findOwnedTrip(userId: string, tripId: string) {
  return db.read((data) => data.trips.find((trip) => trip.id === tripId && trip.userId === userId));
}

tripsRouter.get("/", (request, response) => {
  const userId = request.auth!.user.id;
  const trips = db
    .read((data) => data.trips.filter((trip) => trip.userId === userId))
    .map(toSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return response.json({ trips });
});

tripsRouter.post("/", handle(async (request, response) => {
  const parsed = saveTripRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid trip data.", issues: parsed.error.flatten() });
  }
  const record = await saveTripForUser(request.auth!.user.id, parsed.data.itinerary, parsed.data);
  return response.status(201).json({ trip: toSavedTrip(record) });
}));

tripsRouter.get("/:id", (request, response) => {
  const trip = findOwnedTrip(request.auth!.user.id, String(request.params.id));
  if (!trip) return response.status(404).json({ message: "Trip not found." });
  return response.json({ trip: toSavedTrip(trip) });
});

tripsRouter.put("/:id", handle(async (request, response) => {
  const parsed = updateTripRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid trip update.", issues: parsed.error.flatten() });
  }
  const userId = request.auth!.user.id;
  const updated = await db.mutate((data) => {
    const trip = data.trips.find((entry) => entry.id === String(request.params.id) && entry.userId === userId);
    if (!trip) return null;
    if (parsed.data.title !== undefined) trip.title = parsed.data.title;
    if (parsed.data.notes !== undefined) trip.notes = parsed.data.notes;
    if (parsed.data.itinerary !== undefined) trip.itinerary = parsed.data.itinerary;
    if (parsed.data.preferences !== undefined) trip.preferences = parsed.data.preferences;
    trip.updatedAt = new Date().toISOString();
    return trip;
  });
  if (!updated) return response.status(404).json({ message: "Trip not found." });
  return response.json({ trip: toSavedTrip(updated) });
}));

tripsRouter.post("/:id/duplicate", handle(async (request, response) => {
  const userId = request.auth!.user.id;
  const original = findOwnedTrip(userId, String(request.params.id));
  if (!original) return response.status(404).json({ message: "Trip not found." });
  const copy = await saveTripForUser(userId, structuredClone(original.itinerary), {
    title: `${original.title} (copy)`,
    notes: original.notes,
    preferences: structuredClone(original.preferences),
  });
  return response.status(201).json({ trip: toSavedTrip(copy) });
}));

tripsRouter.delete("/:id", handle(async (request, response) => {
  const userId = request.auth!.user.id;
  const tripId = String(request.params.id);
  const removed = await db.mutate((data) => {
    const before = data.trips.length;
    data.trips = data.trips.filter((trip) => !(trip.id === tripId && trip.userId === userId));
    return data.trips.length < before;
  });
  if (!removed) return response.status(404).json({ message: "Trip not found." });
  await deleteTripInSupabase(tripId, userId);
  return response.status(204).end();
}));
