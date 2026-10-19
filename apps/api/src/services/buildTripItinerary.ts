import {
  itinerarySchema,
  type CustomizeOperation,
  type Itinerary,
  type TravelPreferences,
  type TripWeather,
} from "@ai-travel-planner/shared";
import { findDestination, getDestination } from "../data/catalog.js";
import type { Destination } from "../data/types.js";
import {
  addDays,
  bestInsertIndex,
  closedOn,
  closureText,
  decomposeDay,
  hotelById,
  pickReplacementRestaurant,
  planItinerary,
  refreshItinerary,
  rescheduleDay,
  seasonalWeather,
  seasonNote,
  sourceFromDestination,
  type PlannerSource,
} from "./planner.js";
import { buildLiveSource, fetchWeatherDays } from "./travelData.js";
import { enrichItineraryWithRealRouting } from "./geo.js";
import { personalizeItineraryWithAi } from "./ai.js";

export class ItineraryEditError extends Error {}

function countDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

async function resolveSource(destination: string): Promise<PlannerSource> {
  const curated = findDestination(destination);
  return curated ? sourceFromDestination(curated) : buildLiveSource(destination);
}

async function weatherForTrip(source: PlannerSource, startDate: string, dayCount: number): Promise<TripWeather[]> {
  const endDate = addDays(startDate, dayCount - 1);
  const live = await fetchWeatherDays(startDate, endDate, source.center);
  return Array.from({ length: dayCount }, (_unused, index) => live[index] ?? seasonalWeather(source.season, addDays(startDate, index)));
}

export async function buildTripItinerary(preferences: TravelPreferences): Promise<Itinerary> {
  const source = await resolveSource(preferences.destination);
  const dayCount = countDays(preferences.startDate, preferences.endDate);
  const weather = await weatherForTrip(source, preferences.startDate, dayCount);

  const itinerary = planItinerary(source, {
    startDate: preferences.startDate,
    dayCount,
    travelers: preferences.travelers ?? 1,
    travelStyle: preferences.travelStyle ?? "mid",
    accommodationType: preferences.accommodationType ?? "any",
    pace: preferences.pace ?? "balanced",
    interests: preferences.interests,
    budgetInr: preferences.budgetInr,
    excludePlaceIds: preferences.excludePlaceIds ?? [],
    includePlaceIds: preferences.includePlaceIds ?? [],
    seed: preferences.seed ?? 0,
    weather,
    notes: preferences.notes,
  });

  // 1. Real Road Routing via Geoapify API (with Redis caching and graceful fallback)
  await enrichItineraryWithRealRouting(itinerary);

  // 2. Gemini AI Personalization (honors user notes, vegetarian/kids, generates custom tips)
  const aiResult = await personalizeItineraryWithAi(itinerary, preferences);
  if (aiResult.aiTips && aiResult.aiTips.length > 0) {
    itinerary.aiTips = aiResult.aiTips;
  }
  if (aiResult.personalizedSummary) {
    itinerary.summary = aiResult.personalizedSummary;
  }
  if (aiResult.notesAdvice) {
    itinerary.notesAdvice = aiResult.notesAdvice;
  }

  return itinerarySchema.parse(itinerary);
}

/** Cost estimates for standard trip lengths and every travel style, using seasonal weather (no network calls). */
export function estimateDurations(destination: Destination, options: { travelers: number; startDate: string; interests: string[] }) {
  const source = sourceFromDestination(destination);
  const durations = [3, 4, 5, 7];
  const styles = ["budget", "mid", "premium"] as const;

  return durations.map((days) => ({
    days,
    styles: Object.fromEntries(
      styles.map((style) => {
        const itinerary = planItinerary(source, {
          startDate: options.startDate,
          dayCount: days,
          travelers: options.travelers,
          travelStyle: style,
          accommodationType: "any",
          pace: "balanced",
          interests: options.interests,
          excludePlaceIds: [],
          includePlaceIds: [],
          seed: 0,
          weather: [],
        });
        return [style, { ...itinerary.costBreakdown!, highlights: itinerary.days.map((day) => day.theme) }];
      }),
    ),
  }));
}

function sourceForItinerary(itinerary: Itinerary): PlannerSource {
  const curated = itinerary.destinationKey ? getDestination(itinerary.destinationKey) : null;
  if (curated) return sourceFromDestination(curated);

  // Non-curated trips: rebuild a minimal source from what the itinerary itself carries.
  const center = itinerary.center ?? { name: itinerary.destination, lat: 20.5937, lon: 78.9629 };
  const bases = itinerary.stays.map((stay) => ({
    key: stay.baseKey,
    name: stay.baseName,
    lat: stay.hotel?.lat ?? center.lat,
    lon: stay.hotel?.lon ?? center.lon,
  }));
  return {
    key: null,
    name: itinerary.destination,
    center,
    hilly: false,
    gatewayBase: bases[0]?.key ?? "main",
    bases: bases.length > 0 ? bases : [{ key: "main", name: itinerary.destination, lat: center.lat, lon: center.lon }],
    attractions: [],
    restaurants: [],
    hotels: [],
    season: null,
    mustTryDishes: itinerary.mustTryDishes,
    dataQuality: itinerary.dataQuality,
  };
}

function usedRestaurantIds(itinerary: Itinerary) {
  return new Set(
    itinerary.days.flatMap((day) => day.activities.filter((activity) => activity.kind === "meal").map((activity) => activity.placeId ?? "")),
  );
}

function dayIndexOf(itinerary: Itinerary, dayNumber: number) {
  const index = itinerary.days.findIndex((day) => day.dayNumber === dayNumber);
  if (index < 0) throw new ItineraryEditError(`Day ${dayNumber} does not exist in this trip.`);
  return index;
}

/** Apply a single user edit and return the updated itinerary with refreshed times, routes and costs. */
export async function customizeItinerary(input: Itinerary, operation: CustomizeOperation): Promise<Itinerary> {
  const itinerary: Itinerary = structuredClone(input);
  const source = sourceForItinerary(itinerary);
  const used = usedRestaurantIds(itinerary);
  const rescheduleAll = () => {
    itinerary.days.forEach((day, index) => rescheduleDay(itinerary, index, decomposeDay(day, source), source, used));
  };

  switch (operation.type) {
    case "remove": {
      const dayIndex = dayIndexOf(itinerary, operation.dayNumber);
      const day = itinerary.days[dayIndex]!;
      const target = day.activities[operation.index];
      if (!target) throw new ItineraryEditError("That activity no longer exists.");
      if (target.kind === "meal" || target.kind === "transfer") {
        throw new ItineraryEditError("Meals and transfers can't be removed — swap the restaurant instead.");
      }
      const edit = decomposeDay(day, source);
      edit.stops = edit.stops.filter((stop) => stop.id !== target.placeId && stop.name !== target.title);
      rescheduleDay(itinerary, dayIndex, edit, source, used);
      break;
    }

    case "move": {
      const dayIndex = dayIndexOf(itinerary, operation.dayNumber);
      const day = itinerary.days[dayIndex]!;
      const target = day.activities[operation.index];
      if (!target) throw new ItineraryEditError("That activity no longer exists.");
      const edit = decomposeDay(day, source);
      const position = edit.stops.findIndex((stop) => stop.id === target.placeId || stop.name === target.title);
      const swapWith = position + operation.direction;
      if (position < 0 || swapWith < 0 || swapWith >= edit.stops.length) {
        throw new ItineraryEditError("This stop can't be moved further in that direction.");
      }
      [edit.stops[position], edit.stops[swapWith]] = [edit.stops[swapWith]!, edit.stops[position]!];
      rescheduleDay(itinerary, dayIndex, edit, source, used);
      break;
    }

    case "add": {
      const dayIndex = dayIndexOf(itinerary, operation.dayNumber);
      const day = itinerary.days[dayIndex]!;
      const attraction = source.attractions.find((entry) => entry.id === operation.placeId);
      if (!attraction) throw new ItineraryEditError("That place isn't available for this destination.");
      const alreadyPlanned = itinerary.days.some((entry) => entry.activities.some((activity) => activity.placeId === attraction.id));
      if (alreadyPlanned) throw new ItineraryEditError(`${attraction.name} is already in your plan.`);

      if (closedOn(attraction, day.date)) throw new ItineraryEditError(`${closureText(attraction)}. Try adding it to a different day.`);

      const edit = decomposeDay(day, source);
      const stay = itinerary.stays.find((entry) => entry.baseKey === day.baseKey);
      const start = stay?.hotel ?? source.center;
      edit.stops.splice(bestInsertIndex(edit.stops, start, attraction), 0, attraction);
      rescheduleDay(itinerary, dayIndex, edit, source, used);
      break;
    }

    case "swapMeal": {
      const dayIndex = dayIndexOf(itinerary, operation.dayNumber);
      const day = itinerary.days[dayIndex]!;
      const target = day.activities[operation.index];
      if (!target || target.kind !== "meal") throw new ItineraryEditError("Select a meal to swap.");
      const edit = decomposeDay(day, source);
      const slot = target.title.startsWith("Lunch") ? "lunch" : "dinner";
      const current = slot === "lunch" ? edit.lunch : edit.dinner;
      if (!current) throw new ItineraryEditError("Couldn't find that meal.");
      const replacement = pickReplacementRestaurant(itinerary, dayIndex, current, slot, source);
      if (!replacement) throw new ItineraryEditError("No other restaurant recommendations are available nearby.");
      if (slot === "lunch") edit.lunch = replacement;
      else edit.dinner = replacement;
      rescheduleDay(itinerary, dayIndex, edit, source, used);
      break;
    }

    case "moveDay": {
      if (operation.fromDayNumber === operation.toDayNumber) {
        break;
      }
      const fromDayIndex = dayIndexOf(itinerary, operation.fromDayNumber);
      const toDayIndex = dayIndexOf(itinerary, operation.toDayNumber);
      const fromDay = itinerary.days[fromDayIndex]!;
      const toDay = itinerary.days[toDayIndex]!;

      const target = fromDay.activities[operation.index];
      if (!target) throw new ItineraryEditError("That activity no longer exists.");
      if (target.kind === "meal" || target.kind === "transfer") {
        throw new ItineraryEditError("Meals and transfers can't be moved between days.");
      }

      const attraction = source.attractions.find(
        (entry) => (target.placeId && entry.id === target.placeId) || entry.name === target.title
      );
      if (!attraction) throw new ItineraryEditError("Place details not found in catalog.");

      if (closedOn(attraction, toDay.date)) {
        throw new ItineraryEditError(`${closureText(attraction)}. Cannot move to Day ${operation.toDayNumber}.`);
      }

      // Remove from source day
      const fromEdit = decomposeDay(fromDay, source);
      fromEdit.stops = fromEdit.stops.filter((stop) => stop.id !== attraction.id && stop.name !== attraction.name);
      rescheduleDay(itinerary, fromDayIndex, fromEdit, source, used);

      // Add to destination day
      const toEdit = decomposeDay(toDay, source);
      const toStay = itinerary.stays.find((entry) => entry.baseKey === toDay.baseKey);
      const toStart = toStay?.hotel ?? source.center;
      toEdit.stops.splice(bestInsertIndex(toEdit.stops, toStart, attraction), 0, attraction);
      rescheduleDay(itinerary, toDayIndex, toEdit, source, used);
      break;
    }

    case "setHotel": {
      const stay = itinerary.stays.find((entry) => entry.baseKey === operation.baseKey);
      if (!stay) throw new ItineraryEditError("That stay isn't part of this trip.");
      const hotel = hotelById(source, itinerary, operation.baseKey, operation.hotelId);
      if (!hotel) throw new ItineraryEditError("That hotel isn't available here.");
      stay.hotel = hotel;
      itinerary.days.forEach((day, index) => {
        if (day.baseKey === operation.baseKey) rescheduleDay(itinerary, index, decomposeDay(day, source), source, used);
      });
      break;
    }

    case "setTravelers": {
      itinerary.travelers = operation.travelers;
      rescheduleAll();
      break;
    }

    case "setStartDate": {
      const dayCount = itinerary.days.length;
      itinerary.startDate = operation.startDate;
      itinerary.endDate = addDays(operation.startDate, dayCount - 1);
      const weather = await weatherForTrip(source, operation.startDate, dayCount);
      itinerary.days.forEach((day, index) => {
        day.date = addDays(operation.startDate, index);
        day.weather = weather[index] ?? seasonalWeather(source.season, day.date);
      });
      let night = 0;
      for (const stay of itinerary.stays) {
        stay.checkIn = addDays(operation.startDate, night);
        night += stay.nights;
      }
      const note = seasonNote(source.season, operation.startDate);
      if (note) itinerary.seasonNote = note;
      rescheduleAll();
      break;
    }
  }

  const refreshed = refreshItinerary(itinerary, source);
  await enrichItineraryWithRealRouting(refreshed);
  return itinerarySchema.parse(refreshed);
}
