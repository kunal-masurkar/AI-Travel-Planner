import {
  itinerarySchema,
  type TravelPreferences,
  type TripDay,
} from "@ai-travel-planner/shared";

const destinationHighlights: Record<string, string[]> = {
  delhi: ["Red Fort sunrise walk", "Old Delhi food trail", "India Gate evening stroll"],
  mumbai: ["Marine Drive morning walk", "Street food lunch", "Gateway of India sunset"],
  jaipur: ["Amber Fort sunrise", "City Palace visit", "Pink City bazaar evening"],
  goa: ["Beach sunrise walk", "Seafood lunch stop", "Mandovi river sunset"],
  udaipur: ["Lake Pichola morning walk", "City Palace visit", "Sunset at Fateh Sagar"],
  kerala: ["Backwaters morning cruise", "Local lunch stop", "Kathakali evening"],
  varanasi: ["Ghats at sunrise", "Banaras lunch break", "Ganga aarti evening"],
  kolkata: ["Heritage tram ride", "Misti lunch stop", "Riverside evening"],
  himachal: ["Mountain morning view", "Cafe lunch stop", "Hill town sunset"],
  india: ["Local landmark walk", "Regional food stop", "Cultural evening"],
};

function differenceInDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function advanceDate(startDate: string, offsetDays: number) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
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
      estCostInr: Math.round(dailySpending * 0.2),
      notes: "Replace this placeholder with a live Indian place lookup when APIs are connected.",
    },
    {
      time: "13:00",
      title: `${interest} lunch and cafe break`,
      category: "food" as const,
      estCostInr: Math.round(dailySpending * 0.25),
    },
    {
      time: "18:30",
      title: `${baseTitle} evening walk`,
      category: "evening" as const,
      estCostInr: Math.round(dailySpending * 0.15),
    },
  ];
}

function buildWeather(dayNumber: number) {
  return {
    condition: dayNumber % 2 === 0 ? "Clear" : "Mild",
    tempHighC: 28 + (dayNumber % 4),
    tempLowC: 18 + (dayNumber % 3),
  };
}

export function buildDemoItinerary(preferences: TravelPreferences) {
  const dayCount = differenceInDays(preferences.startDate, preferences.endDate);
  const budgetPerDay = preferences.budgetInr / dayCount;
  const startDate = new Date(`${preferences.startDate}T00:00:00Z`);
  const destinationLabel = preferences.destination.split(",")[0]?.trim() || preferences.destination;

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
    tripTitle: `${dayCount}-Day ${destinationLabel} Trip`,
    destination: preferences.destination,
    startDate: preferences.startDate,
    endDate: preferences.endDate,
    budgetEstimateInr: Math.round(preferences.budgetInr),
    generatedAt: new Date().toISOString(),
    summary: `A ${preferences.pace} itinerary across India built around ${preferences.interests.join(", ")}.`,
    days,
  });
}
