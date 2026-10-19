import { Router } from "express";
import { handle } from "./handle.js";
import {
  customizeRequestSchema,
  generateTripRequestSchema,
  generateTripResponseSchema,
} from "@ai-travel-planner/shared";
import { optionalAuth } from "../auth/auth.js";
import { buildTripItinerary, customizeItinerary, ItineraryEditError } from "../services/buildTripItinerary.js";
import { saveTripForUser } from "./trips.js";

export const itinerariesRouter = Router();

itinerariesRouter.post("/generate", optionalAuth, handle(async (request, response) => {
  const parsedRequest = generateTripRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    return response.status(400).json({
      message: parsedRequest.error.issues[0]?.message ?? "Invalid trip request",
      issues: parsedRequest.error.flatten(),
    });
  }

  const itinerary = await buildTripItinerary(parsedRequest.data);

  // Signed-in travellers get every generated plan saved to their account automatically
  // (regenerating an already-saved trip passes ?save=false and updates that trip instead).
  let savedTripId: string | undefined;
  if (request.auth && request.query.save !== "false") {
    const saved = await saveTripForUser(request.auth.user.id, itinerary, {
      notes: parsedRequest.data.notes,
      preferences: parsedRequest.data as unknown as Record<string, unknown>,
    });
    savedTripId = saved.id;
  }

  const payload = generateTripResponseSchema.parse({
    itinerary,
    source: itinerary.dataQuality === "live" ? "live-hybrid" : "local-demo",
    ...(savedTripId ? { savedTripId } : {}),
  });
  return response.json(payload);
}));

itinerariesRouter.post("/customize", handle(async (request, response) => {
  const parsed = customizeRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: "Invalid edit request.", issues: parsed.error.flatten() });
  }
  try {
    const itinerary = await customizeItinerary(parsed.data.itinerary, parsed.data.operation);
    return response.json({ itinerary });
  } catch (error) {
    if (error instanceof ItineraryEditError) {
      return response.status(422).json({ message: error.message });
    }
    throw error;
  }
}));
