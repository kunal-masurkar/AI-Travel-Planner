import {
  itinerarySchema,
  type TravelPreferences,
  type TripDay,
  type TripLocation,
} from "@ai-travel-planner/shared";
import { geocodeDestination, fetchGeoapifyPlaces, fetchWeatherDays } from "./travelData.js";

function splitDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function advanceDate(startDate: string, offsetDays: number) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function pickTheme(destination: string, interests: string[], dayNumber: number, liveHint?: string) {
  const interest = interests[(dayNumber - 1) % interests.length] ?? "local discovery";
  const hint = liveHint ? liveHint.toLowerCase() : destination.toLowerCase();
  return `${interest} day with ${hint}`;
}

function buildFallbackActivityTitle(destination: string, interest: string, label: string) {
  return `${destination} ${interest} ${label}`;
}

export async function buildTripItinerary(preferences: TravelPreferences) {
  const dayCount = splitDays(preferences.startDate, preferences.endDate);
  const budgetPerDay = preferences.budgetInr / dayCount;
  const destinationPoint = await geocodeDestination(preferences.destination);
  const weatherDays = await fetchWeatherDays(preferences.startDate, preferences.endDate, destinationPoint);
  const places = await fetchGeoapifyPlaces(destinationPoint);

  const placeBuckets = {
    sightseeing: places.slice(0, 6),
    food: places.slice(6, 12),
    evening: places.slice(12, 18),
  };

  const days: TripDay[] = Array.from({ length: dayCount }, (_unused, index) => {
    const dayNumber = index + 1;
    const weather = weatherDays[index] ?? weatherDays[weatherDays.length - 1];
    const morningPlace: TripLocation | undefined = placeBuckets.sightseeing.length
      ? placeBuckets.sightseeing[index % placeBuckets.sightseeing.length]
      : undefined;
    const lunchPlace: TripLocation | undefined = placeBuckets.food.length
      ? placeBuckets.food[index % placeBuckets.food.length]
      : undefined;
    const eveningPlace: TripLocation | undefined = placeBuckets.evening.length
      ? placeBuckets.evening[index % placeBuckets.evening.length]
      : undefined;
    const interest = preferences.interests[(index) % preferences.interests.length] ?? "exploration";

    return {
      dayNumber,
      date: weather?.date ?? advanceDate(preferences.startDate, index),
      theme: pickTheme(preferences.destination, preferences.interests, dayNumber, morningPlace?.name),
      weather: {
        condition: weather?.condition ?? (dayNumber % 2 === 0 ? "Clear" : "Cloudy"),
        tempHighC: weather?.tempHighC ?? 28,
        tempLowC: weather?.tempLowC ?? 20,
      },
      activities: [
        {
          time: "09:00",
          title: morningPlace?.name ?? buildFallbackActivityTitle(preferences.destination, interest, "morning stop"),
          category: "sightseeing" as const,
          estCostInr: Math.round(budgetPerDay * 0.2),
          notes: morningPlace?.address ?? "Live place lookup when available.",
          location: morningPlace,
        },
        {
          time: "13:00",
          title: lunchPlace?.name ?? buildFallbackActivityTitle(preferences.destination, interest, "lunch stop"),
          category: "food" as const,
          estCostInr: Math.round(budgetPerDay * 0.25),
          notes: lunchPlace?.address ?? "Live place lookup when available.",
          location: lunchPlace,
        },
        {
          time: "18:30",
          title: eveningPlace?.name ?? buildFallbackActivityTitle(preferences.destination, interest, "evening stop"),
          category: "evening" as const,
          estCostInr: Math.round(budgetPerDay * 0.15),
          notes: eveningPlace?.address ?? "Live place lookup when available.",
          location: eveningPlace,
        },
      ],
    };
  });

  return itinerarySchema.parse({
    tripId: `${preferences.destination.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    tripTitle: `${dayCount}-Day ${destinationPoint.name} Trip`,
    destination: destinationPoint.name,
    startDate: preferences.startDate,
    endDate: preferences.endDate,
    budgetEstimateInr: Math.round(preferences.budgetInr),
    generatedAt: new Date().toISOString(),
    summary: `A ${preferences.pace} trip across India built around ${preferences.interests.join(", ")}.`,
    days,
  });
}
