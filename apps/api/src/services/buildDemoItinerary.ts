import { type TravelPreferences } from "@ai-travel-planner/shared";
import { buildTripItinerary } from "./buildTripItinerary.js";

export async function buildDemoItinerary(preferences: TravelPreferences) {
  return buildTripItinerary(preferences);
}
