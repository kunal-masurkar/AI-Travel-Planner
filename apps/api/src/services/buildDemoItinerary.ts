import {
  itinerarySchema,
  type TravelPreferences,
  type TripDay,
} from "@ai-travel-planner/shared";

const destinationHighlights: Record<string, string[]> = {
  japan: ["Temple morning walk", "Ramen lunch stop", "Night street food crawl"],
  paris: ["Museum opening hour", "Cafes and pastry stops", "Seine evening stroll"],
  london: ["Historic district walk", "Market lunch", "Riverfront sunset"],
};

function differenceInDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function advanceDate(startDate: string, offsetDays: number) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return formatDate(date);
}

function pickTheme(destination: string, interests: string[], dayNumber: number) {
  const destinationKey = destination.toLowerCase();
  const matches = Object.entries(destinationHighlights).find(([key]) => destinationKey.includes(key));
  const highlightPool = matches?.[1] ?? [];
  const interest = interests[(dayNumber - 1) % interests.length] ?? "local discovery";
  const highlight = highlightPool[(dayNumber - 1) % Math.max(highlightPool.length, 1)] ?? "Neighborhood exploration";
  return `${interest} day with ${highlight.toLowerCase()}`;
}

function buildActivities(destination: string, interests: string[], dayNumber: number, budgetPerDay: number) {
  const baseTitle = destination.split(",")[0]?.trim() || destination;
  const interest = interests[(dayNumber - 1) % interests.length] ?? "exploration";
  const dailySpending = Math.max(0, Math.round(budgetPerDay));

  return [
    {
      time: "09:00",
      title: `${baseTitle} signature ${interest} stop`,
      category: "sightseeing" as const,
      estCostUsd: Math.round(dailySpending * 0.2),
      notes: "Replace this placeholder with a live place lookup when APIs are connected.",
    },
    {
      time: "13:00",
      title: `${interest} lunch and cafe break`,
      category: "food" as const,
      estCostUsd: Math.round(dailySpending * 0.25),
    },
    {
      time: "18:30",
      title: `${baseTitle} evening walk`,
      category: "evening" as const,
      estCostUsd: Math.round(dailySpending * 0.15),
    },
  ];
}

function buildWeather(dayNumber: number) {
  return {
    condition: dayNumber % 2 === 0 ? "Clear" : "Mild",
    tempHighC: 22 + (dayNumber % 3),
    tempLowC: 14 + (dayNumber % 2),
  };
}

export function buildDemoItinerary(preferences: TravelPreferences) {
  const dayCount = differenceInDays(preferences.startDate, preferences.endDate);
  const budgetPerDay = preferences.budgetUsd / dayCount;
  const startDate = new Date(`${preferences.startDate}T00:00:00Z`);

  const days: TripDay[] = Array.from({ length: dayCount }, (_unused, index) => {
    const dayNumber = index + 1;
    return {
      dayNumber,
      date: advanceDate(preferences.startDate, index),
      theme: pickTheme(preferences.destination, preferences.interests, dayNumber),
      weather: buildWeather(dayNumber),
      activities: buildActivities(preferences.destination, preferences.interests, dayNumber, budgetPerDay),
    };
  });

  return itinerarySchema.parse({
    tripId: `${preferences.destination.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${startDate.getTime()}`,
    tripTitle: `${dayCount}-Day ${preferences.destination} Trip`,
    destination: preferences.destination,
    startDate: preferences.startDate,
    endDate: preferences.endDate,
    budgetEstimateUsd: Math.round(preferences.budgetUsd),
    generatedAt: new Date().toISOString(),
    summary: `A ${preferences.pace} itinerary built around ${preferences.interests.join(", ")}.`,
    days,
  });
}
