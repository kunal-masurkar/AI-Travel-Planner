import { Router } from "express";
import { destinations, getDestination, searchDestinations } from "../data/catalog.js";
import type { Destination } from "../data/types.js";
import { estimateDurations } from "../services/buildTripItinerary.js";

export const destinationsRouter = Router();

const estimateCache = new Map<string, ReturnType<typeof estimateDurations>>();

/** First day of the next "best month" so estimates reflect a sensible season. */
function defaultStartDate(destination: Destination) {
  const now = new Date();
  for (let offset = 1; offset <= 12; offset += 1) {
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    if (destination.season.bestMonths.includes(candidate.getUTCMonth() + 1)) {
      return candidate.toISOString().slice(0, 10);
    }
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

function estimatesFor(destination: Destination, travelers: number, startDate: string) {
  const cacheKey = `${destination.key}:${travelers}:${startDate.slice(0, 7)}`;
  let cached = estimateCache.get(cacheKey);
  if (!cached) {
    cached = estimateDurations(destination, { travelers, startDate, interests: destination.interests });
    estimateCache.set(cacheKey, cached);
  }
  return cached;
}

function summary(destination: Destination) {
  const estimates = estimatesFor(destination, 2, defaultStartDate(destination));
  const threeDay = estimates.find((entry) => entry.days === 3)!;
  return {
    key: destination.key,
    name: destination.name,
    state: destination.state,
    aliases: destination.aliases,
    emoji: destination.emoji,
    tagline: destination.tagline,
    description: destination.description,
    wiki: destination.wiki,
    center: destination.center,
    highlights: destination.highlights,
    interests: destination.interests,
    bestMonths: destination.season.bestMonths,
    seasonSummary: destination.season.summary,
    durations: estimates.map((entry) => entry.days),
    perPersonFrom3Days: {
      budget: threeDay.styles.budget!.perPerson,
      mid: threeDay.styles.mid!.perPerson,
      premium: threeDay.styles.premium!.perPerson,
    },
    counts: {
      attractions: destination.attractions.length,
      restaurants: destination.restaurants.length,
      hotels: destination.hotels.length,
    },
  };
}

destinationsRouter.get("/", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  return response.json({ destinations: (query ? searchDestinations(query) : destinations).map(summary) });
});

destinationsRouter.get("/:key", (request, response) => {
  const destination = getDestination(request.params.key);
  if (!destination) return response.status(404).json({ message: "Destination not found." });

  const travelers = Math.min(30, Math.max(1, Number.parseInt(String(request.query.travelers ?? "2"), 10) || 2));
  const requestedStart = typeof request.query.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.query.startDate) ? request.query.startDate : null;
  const startDate = requestedStart ?? defaultStartDate(destination);

  return response.json({
    destination: { ...summary(destination), ...destination },
    estimates: { travelers, startDate, durations: estimatesFor(destination, travelers, startDate) },
  });
});
