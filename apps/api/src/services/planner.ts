import type {
  AccommodationType,
  ActivityCategory,
  BestTime,
  CostBreakdown,
  Hotel,
  Interest,
  Itinerary,
  Stay,
  TravelPace,
  TravelStyle,
  TripActivity,
  TripAlternative,
  TripDay,
  TripWeather,
} from "@ai-travel-planner/shared";
import type { Attraction, Base, CatalogHotel, Destination, Restaurant, SeasonInfo } from "../data/types.js";
import { centroid, estimateLeg, haversineKm, round1, type LatLon } from "./geo.js";

// ---------------------------------------------------------------------------
// Planner source: a curated destination, or one assembled from live/generic data
// ---------------------------------------------------------------------------

export interface PlannerSource {
  key: string | null;
  name: string;
  center: LatLon;
  hilly: boolean;
  gatewayBase: string;
  bases: Base[];
  attractions: Attraction[];
  restaurants: Restaurant[];
  hotels: CatalogHotel[];
  season: SeasonInfo | null;
  mustTryDishes: string[];
  dataQuality: "curated" | "live" | "generic";
}

const hillyDestinations = new Set(["himachal", "kerala"]);

export function sourceFromDestination(destination: Destination): PlannerSource {
  return {
    key: destination.key,
    name: destination.name,
    center: destination.center,
    hilly: hillyDestinations.has(destination.key),
    gatewayBase: destination.gatewayBase,
    bases: destination.bases,
    attractions: destination.attractions,
    restaurants: destination.restaurants,
    hotels: destination.hotels,
    season: destination.season,
    mustTryDishes: destination.mustTryDishes.map((dish) => dish.name),
    dataQuality: "curated",
  };
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const paceConfig: Record<TravelPace, { startMin: number; dayBudgetMin: number; maxStops: number }> = {
  relaxed: { startMin: 9 * 60 + 30, dayBudgetMin: 330, maxStops: 3 },
  balanced: { startMin: 9 * 60, dayBudgetMin: 420, maxStops: 4 },
  packed: { startMin: 8 * 60, dayBudgetMin: 540, maxStops: 6 },
};

/** Per-person daily allowances for things not tied to a specific place. */
const dailyAllowance: Record<TravelStyle, { breakfast: number; snacks: number }> = {
  budget: { breakfast: 100, snacks: 150 },
  mid: { breakfast: 200, snacks: 250 },
  premium: { breakfast: 0, snacks: 450 },
};

const transportRates: Record<TravelStyle, { perKm: number; minPerDay: number; seatsPerVehicle: number; perPerson: boolean }> = {
  // Buses, shared autos and metro: priced per traveller.
  budget: { perKm: 6, minPerDay: 250, seatsPerVehicle: 1, perPerson: true },
  // Hired cab / app taxis: priced per vehicle.
  mid: { perKm: 18, minPerDay: 1500, seatsPerVehicle: 4, perPerson: false },
  // Private car or SUV with driver.
  premium: { perKm: 28, minPerDay: 3200, seatsPerVehicle: 6, perPerson: false },
};

const genericMealCostForTwo: Record<TravelStyle, number> = { budget: 500, mid: 1300, premium: 3500 };
const genericHotelPrice: Record<TravelStyle, number> = { budget: 1800, mid: 4500, premium: 12000 };
const miscRate = 0.07;

const interestAliases: Record<string, Interest[]> = {
  adventure: ["adventure"],
  trekking: ["adventure", "nature"],
  beaches: ["beaches"],
  beach: ["beaches"],
  nature: ["nature"],
  wildlife: ["nature"],
  lakes: ["nature", "relaxation"],
  mountains: ["nature", "adventure"],
  history: ["history"],
  heritage: ["history", "culture"],
  forts: ["history"],
  museums: ["history", "culture"],
  culture: ["culture"],
  art: ["culture"],
  photography: ["nature", "history", "culture"],
  shopping: ["shopping"],
  markets: ["shopping"],
  food: ["food"],
  culinary: ["food"],
  relaxation: ["relaxation"],
  wellness: ["relaxation"],
  yoga: ["relaxation", "spiritual"],
  spiritual: ["spiritual"],
  temples: ["spiritual"],
  nightlife: ["nightlife"],
};

const interestLabels: Record<Interest, string> = {
  adventure: "Adventure",
  beaches: "Beaches",
  nature: "Nature",
  history: "Heritage",
  culture: "Culture",
  shopping: "Bazaars",
  food: "Food Trail",
  relaxation: "Slow Travel",
  spiritual: "Spiritual",
  nightlife: "Nightlife",
};

const bestTimeOrder: Record<BestTime, number> = { sunrise: 0, morning: 1, any: 2, afternoon: 2, sunset: 3, evening: 4 };

export function normalizeInterests(raw: string[]): Interest[] {
  const result = new Set<Interest>();
  for (const value of raw) {
    for (const interest of interestAliases[value.trim().toLowerCase()] ?? []) {
      result.add(interest);
    }
  }
  return [...result];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random number in [0, 1) for a (seed, id) pair. */
function jitter(seed: number, id: string) {
  return (hashString(`${seed}:${id}`) % 10_000) / 10_000;
}

export function formatClock(minutes: number) {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const hours = Math.floor(clamped / 60);
  const mins = Math.round(clamped % 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function addDays(isoDate: string, offset: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function monthOf(isoDate: string) {
  return Number.parseInt(isoDate.slice(5, 7), 10);
}

const weekdayNames = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export function weekdayOf(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function closedOn(attraction: Pick<Attraction, "closedDays">, isoDate: string) {
  return Boolean(attraction.closedDays?.includes(weekdayOf(isoDate)));
}

export function closureText(attraction: Pick<Attraction, "closedDays" | "name">) {
  const days = attraction.closedDays ?? [];
  if (days.length >= 5) {
    const open = [0, 1, 2, 3, 4, 5, 6].filter((day) => !days.includes(day)).map((day) => weekdayNames[day]);
    return `${attraction.name} is only open on ${open.join(" & ")}`;
  }
  return `${attraction.name} is closed on ${days.map((day) => weekdayNames[day]).join(" & ")}`;
}

/** Move stops that fall on their weekly closing day to another day of the same stay (or drop them). */
function avoidClosures(dayGroups: Attraction[][], firstDate: string) {
  dayGroups.forEach((group, groupIndex) => {
    const date = addDays(firstDate, groupIndex);
    for (const stop of [...group]) {
      if (!closedOn(stop, date)) continue;
      group.splice(group.indexOf(stop), 1);
      const target = dayGroups
        .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
        .filter(({ candidateIndex }) => candidateIndex !== groupIndex && !closedOn(stop, addDays(firstDate, candidateIndex)))
        .sort((a, b) => a.candidate.length - b.candidate.length)[0];
      target?.candidate.push(stop);
    }
  });
}

function isRainy(weather: TripWeather | undefined) {
  return Boolean(weather && /rain|shower|drizzle|thunder|monsoon/i.test(weather.condition));
}

function attractionCategory(attraction: Attraction): ActivityCategory {
  switch (attraction.type) {
    case "nature":
      return "nature";
    case "beach":
      return attraction.interests.includes("relaxation") ? "relaxation" : "nature";
    case "adventure":
      return "adventure";
    case "shopping":
      return "shopping";
    case "culture":
    case "spiritual":
    case "museum":
      return attraction.bestTime === "evening" ? "evening" : "culture";
    default:
      return attraction.bestTime === "evening" ? "evening" : "sightseeing";
  }
}

function bookingUrl(hotelName: string, place: string) {
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${hotelName}, ${place}`)}`;
}

function toHotel(hotel: CatalogHotel, place: string, priceIsEstimate = false): Hotel {
  const result: Hotel = {
    id: hotel.id,
    name: hotel.name,
    type: hotel.type,
    tier: hotel.tier,
    pricePerNightInr: hotel.pricePerNightInr,
    area: hotel.area,
    lat: hotel.lat,
    lon: hotel.lon,
    amenities: hotel.amenities,
    description: hotel.description,
    bookingUrl: bookingUrl(hotel.name, place),
  };
  if (hotel.rating > 0) result.rating = hotel.rating;
  if (priceIsEstimate) result.priceIsEstimate = true;
  return result;
}

function placeholderHotel(base: Base, style: TravelStyle): Hotel {
  const label = style === "budget" ? "Budget" : style === "mid" ? "Mid-range" : "Premium";
  return {
    id: `estimate-${base.key}-${style}`,
    name: `${label} hotel in ${base.name}`,
    type: "hotel",
    tier: style,
    pricePerNightInr: genericHotelPrice[style],
    area: base.name,
    lat: base.lat,
    lon: base.lon,
    amenities: [],
    description: "Typical nightly rate for this travel style; search for specific properties.",
    bookingUrl: bookingUrl("hotels", base.name),
    priceIsEstimate: true,
  };
}

// ---------------------------------------------------------------------------
// Converting between catalog entries and itinerary activities
// ---------------------------------------------------------------------------

function attractionFromActivity(activity: TripActivity, fallback: LatLon): Attraction {
  const attraction: Attraction = {
    id: activity.placeId ?? `custom-${hashString(activity.title)}`,
    name: activity.title,
    area: activity.location?.address ?? "",
    base: "",
    type: activity.kind === "leisure" ? "culture" : "landmark",
    interests: [],
    lat: activity.location?.lat ?? fallback.lat,
    lon: activity.location?.lon ?? fallback.lon,
    description: activity.notes ?? "",
    openingHours: activity.openingHours ?? "",
    entryFeeInr: activity.entryFeeInr ?? 0,
    durationMin: activity.durationMin ?? 90,
    bestTime: activity.bestTime ?? "any",
    popularity: 3,
  };
  if (activity.activityFeeInr !== undefined) attraction.activityFeeInr = activity.activityFeeInr;
  if (activity.includesMeal) attraction.includesMeal = activity.includesMeal;
  if (activity.indoor) attraction.indoor = activity.indoor;
  if (activity.wiki) attraction.wiki = activity.wiki;
  return attraction;
}

function restaurantFromActivity(activity: TripActivity, fallback: LatLon): Restaurant {
  return {
    id: activity.placeId ?? `meal-${hashString(activity.title)}`,
    name: activity.title.replace(/^(Lunch|Dinner) at /, ""),
    area: activity.location?.address ?? "",
    base: "",
    lat: activity.location?.lat ?? fallback.lat,
    lon: activity.location?.lon ?? fallback.lon,
    cuisine: activity.notes ?? "",
    specialties: activity.specialties ?? [],
    priceTier: activity.priceTier ?? "mid",
    costForTwoInr: activity.costForTwoInr ?? 1000,
    rating: activity.rating ?? 0,
    openingHours: activity.openingHours ?? "",
    familyFriendly: true,
  };
}

function attractionActivity(attraction: Attraction, startMin: number, travelers: number, isLeisure: boolean): TripActivity {
  const activity: TripActivity = {
    time: formatClock(startMin),
    endTime: formatClock(startMin + attraction.durationMin),
    title: attraction.name,
    category: isLeisure ? "relaxation" : attractionCategory(attraction),
    kind: isLeisure ? "leisure" : "attraction",
    estCostInr: (attraction.entryFeeInr + (attraction.activityFeeInr ?? 0)) * travelers,
    notes: attraction.description,
    location: { name: attraction.name, lat: attraction.lat, lon: attraction.lon, address: attraction.area },
    placeId: attraction.id,
    durationMin: attraction.durationMin,
    entryFeeInr: attraction.entryFeeInr,
    bestTime: attraction.bestTime,
  };
  if (attraction.activityFeeInr) activity.activityFeeInr = attraction.activityFeeInr;
  if (attraction.openingHours) activity.openingHours = attraction.openingHours;
  if (attraction.includesMeal) activity.includesMeal = attraction.includesMeal;
  if (attraction.indoor) activity.indoor = true;
  if (attraction.wiki) activity.wiki = attraction.wiki;
  return activity;
}

function mealActivity(restaurant: Restaurant, slot: "lunch" | "dinner", startMin: number, travelers: number): TripActivity {
  const activity: TripActivity = {
    time: formatClock(startMin),
    endTime: formatClock(startMin + 60),
    title: `${slot === "lunch" ? "Lunch" : "Dinner"} at ${restaurant.name}`,
    category: "food",
    kind: "meal",
    estCostInr: Math.round((restaurant.costForTwoInr / 2) * travelers),
    notes: restaurant.cuisine,
    location: { name: restaurant.name, lat: restaurant.lat, lon: restaurant.lon, address: restaurant.area },
    placeId: restaurant.id,
    durationMin: 60,
    costForTwoInr: restaurant.costForTwoInr,
    priceTier: restaurant.priceTier,
    specialties: restaurant.specialties,
  };
  if (restaurant.rating > 0) activity.rating = restaurant.rating;
  if (restaurant.openingHours) activity.openingHours = restaurant.openingHours;
  return activity;
}

// ---------------------------------------------------------------------------
// Restaurant selection
// ---------------------------------------------------------------------------

const allowedTiers: Record<TravelStyle, TravelStyle[]> = {
  budget: ["budget", "mid"],
  mid: ["mid", "budget"],
  premium: ["premium", "mid"],
};

interface DayContext {
  source: PlannerSource;
  travelers: number;
  style: TravelStyle;
  seed: number;
  pace: TravelPace;
  usedRestaurants: Set<string>;
}

function pickRestaurant(
  ctx: DayContext,
  base: Base,
  anchor: LatLon,
  slot: "lunch" | "dinner",
  exclude: Set<string> = new Set(),
): Restaurant {
  const tiers = allowedTiers[ctx.style] ?? allowedTiers.mid;
  const pool = ctx.source.restaurants.filter(
    (restaurant) =>
      (restaurant.base === base.key || ctx.source.bases.length === 1) &&
      tiers.includes(restaurant.priceTier) &&
      !exclude.has(restaurant.id) &&
      !(slot === "dinner" && restaurant.snackOnly),
  );

  const score = (restaurant: Restaurant, reusePenalty: boolean) =>
    haversineKm(anchor, restaurant) * 1.2 -
    restaurant.rating * 1.5 +
    (restaurant.priceTier === ctx.style ? 0 : 1.5) +
    (restaurant.snackOnly ? 1 : 0) +
    (reusePenalty && ctx.usedRestaurants.has(restaurant.id) ? 50 : 0) +
    jitter(ctx.seed, restaurant.id) * 0.8;

  const best = [...pool].sort((a, b) => score(a, true) - score(b, true))[0] ?? (exclude.size > 0 ? null : undefined);
  if (best === null) {
    return pickRestaurant(ctx, base, anchor, slot);
  }
  if (best) {
    ctx.usedRestaurants.add(best.id);
    return best;
  }

  return {
    id: `generic-${slot}-${hashString(`${anchor.lat},${anchor.lon}`)}`,
    name: `a local favourite near ${base.name}`,
    area: base.name,
    base: base.key,
    lat: anchor.lat,
    lon: anchor.lon,
    cuisine: "Regional cuisine — ask locals for the busiest spot nearby",
    specialties: ctx.source.mustTryDishes.slice(0, 2),
    priceTier: ctx.style,
    costForTwoInr: genericMealCostForTwo[ctx.style],
    rating: 0,
    openingHours: "",
    familyFriendly: true,
  };
}

// ---------------------------------------------------------------------------
// Day scheduling
// ---------------------------------------------------------------------------

interface DayPlanInput {
  dayNumber: number;
  date: string;
  base: Base;
  hotelLocation: LatLon;
  stops: Attraction[];
  leisureIds: Set<string>;
  transferFrom: Base | null;
  weather: TripWeather;
  /** Restaurants to keep when re-scheduling an edited day. */
  keepMeals?: { lunch?: Restaurant | undefined; dinner?: Restaurant | undefined };
  /** When true, stops keep their given order (user edits); otherwise they are sorted for time of day. */
  preserveOrder: boolean;
}

function orderStopsForDay(stops: Attraction[], start: LatLon) {
  const buckets = new Map<number, Attraction[]>();
  for (const stop of stops) {
    const order = stop.id.startsWith("leisure-") ? 2.5 : bestTimeOrder[stop.bestTime];
    buckets.set(order, [...(buckets.get(order) ?? []), stop]);
  }

  const ordered: Attraction[] = [];
  let position = start;
  for (const order of [...buckets.keys()].sort((a, b) => a - b)) {
    const remaining = [...(buckets.get(order) ?? [])];
    while (remaining.length > 0) {
      remaining.sort((a, b) => haversineKm(position, a) - haversineKm(position, b));
      const next = remaining.shift()!;
      ordered.push(next);
      position = next;
    }
  }
  return ordered;
}

function buildDayTheme(stops: Attraction[], base: Base, transferFrom: Base | null) {
  const areas = [...new Set(stops.map((stop) => stop.area).filter(Boolean))].slice(0, 2);
  const counts = new Map<Interest, number>();
  for (const stop of stops) {
    for (const interest of stop.interests) counts.set(interest, (counts.get(interest) ?? 0) + 1);
  }
  const labels = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([interest]) => interestLabels[interest]);

  const where = areas.length > 0 ? areas.join(" & ") : base.name;
  if (transferFrom) {
    return `Travel to ${base.name}${areas.length > 0 ? ` · ${where}` : ""}`;
  }
  return labels.length > 0 ? `${where} — ${labels.join(" & ")}` : `${where} at Leisure`;
}

function scheduleDay(input: DayPlanInput, ctx: DayContext): TripDay {
  const pace = paceConfig[ctx.pace];
  const hilly = ctx.source.hilly;
  const activities: TripActivity[] = [];
  let travelKm = 0;
  let travelMin = 0;
  let position: LatLon = input.hotelLocation;
  let clock = pace.startMin;

  if (input.transferFrom) {
    const leg = estimateLeg(input.transferFrom, input.base, { hilly });
    clock = 8 * 60;
    activities.push({
      time: formatClock(clock),
      endTime: formatClock(clock + leg.durationMin),
      title: `Transfer ${input.transferFrom.name} → ${input.base.name}`,
      category: "transit",
      kind: "transfer",
      estCostInr: 0,
      notes: `About ${Math.round(leg.distanceKm)} km by road. Check in to your ${input.base.name} stay on arrival.`,
      location: { name: input.base.name, lat: input.base.lat, lon: input.base.lon, address: input.base.name },
      durationMin: leg.durationMin,
      travelFromPrev: leg,
    });
    travelKm += leg.distanceKm;
    travelMin += leg.durationMin;
    clock += leg.durationMin;
    position = input.hotelLocation;
  }

  const stops = input.preserveOrder ? input.stops : orderStopsForDay(input.stops, position);
  if (!input.transferFrom && stops[0]?.bestTime === "sunrise") {
    clock = 5 * 60 + 45;
  }

  let lunchDone = false;
  let dinnerDone = false;
  const todaysRestaurants = new Set<string>(
    [input.keepMeals?.lunch?.id, input.keepMeals?.dinner?.id].filter((id): id is string => Boolean(id)),
  );

  const addMeal = (slot: "lunch" | "dinner", earliest: number) => {
    const kept = slot === "lunch" ? input.keepMeals?.lunch : input.keepMeals?.dinner;
    const restaurant = kept ?? pickRestaurant(ctx, input.base, position, slot, todaysRestaurants);
    todaysRestaurants.add(restaurant.id);
    const leg = estimateLeg(position, restaurant, { hilly });
    clock = Math.max(clock + leg.durationMin, earliest);
    const activity = mealActivity(restaurant, slot, clock, ctx.travelers);
    activity.travelFromPrev = leg;
    activities.push(activity);
    travelKm += leg.distanceKm;
    travelMin += leg.durationMin;
    clock += 60;
    position = restaurant;
  };

  for (const stop of stops) {
    let leg = estimateLeg(position, stop, { hilly });
    let start = alignStart(clock + leg.durationMin, stop.bestTime);

    if (!lunchDone && (clock >= 12 * 60 + 15 || start >= 13 * 60 + 30 || (clock >= 11 * 60 + 30 && start + stop.durationMin > 14 * 60 + 30))) {
      addMeal("lunch", 12 * 60 + 30);
      lunchDone = true;
      leg = estimateLeg(position, stop, { hilly });
      start = alignStart(clock + leg.durationMin, stop.bestTime);
    }
    if (!dinnerDone && stop.includesMeal !== "dinner" && start >= 20 * 60) {
      addMeal("dinner", 19 * 60 + 30);
      dinnerDone = true;
      leg = estimateLeg(position, stop, { hilly });
      start = alignStart(clock + leg.durationMin, stop.bestTime);
    }

    // Generated plans never schedule sightseeing late at night; the stop resurfaces as an alternative.
    if (!input.preserveOrder && start > 21 * 60 + 30) continue;

    const activity = attractionActivity(stop, start, ctx.travelers, input.leisureIds.has(stop.id));
    activity.travelFromPrev = leg;
    activities.push(activity);
    travelKm += leg.distanceKm;
    travelMin += leg.durationMin;
    clock = start + stop.durationMin;
    position = stop;

    if (stop.includesMeal === "lunch") lunchDone = true;
    if (stop.includesMeal === "dinner") dinnerDone = true;
  }

  if (!lunchDone && clock < 16 * 60) addMeal("lunch", 12 * 60 + 30);
  if (!dinnerDone) addMeal("dinner", 19 * 60 + 30);

  return {
    dayNumber: input.dayNumber,
    date: input.date,
    theme: buildDayTheme(stops, input.base, input.transferFrom),
    baseKey: input.base.key,
    baseName: input.base.name,
    weather: input.weather,
    activities,
    alternatives: [],
    travelKm: round1(travelKm),
    travelMin: Math.round(travelMin),
  };
}

function alignStart(start: number, bestTime: BestTime) {
  if (bestTime === "sunset") return Math.max(start, 16 * 60 + 45);
  if (bestTime === "evening") return Math.max(start, 18 * 60);
  return start;
}

// ---------------------------------------------------------------------------
// Selection & grouping
// ---------------------------------------------------------------------------

export interface PlanRequest {
  startDate: string;
  dayCount: number;
  travelers: number;
  travelStyle: TravelStyle;
  accommodationType: AccommodationType;
  pace: TravelPace;
  interests: string[];
  budgetInr?: number | undefined;
  excludePlaceIds: string[];
  includePlaceIds: string[];
  seed: number;
  weather: TripWeather[];
  notes?: string | undefined;
}

function isAvailable(attraction: Attraction, month: number) {
  return !attraction.months || attraction.months.includes(month);
}

function scoreAttraction(attraction: Attraction, interests: Interest[], request: PlanRequest) {
  if (request.includePlaceIds?.includes(attraction.id)) return 1000;
  const matches = attraction.interests.filter((interest) => interests.includes(interest)).length;
  const jitterWeight = request.seed > 0 ? 1.6 : 0.3;
  return attraction.popularity + matches * 1.8 + jitter(request.seed, attraction.id) * jitterWeight;
}

interface BaseSegment {
  base: Base;
  days: number;
  stops: Attraction[];
}

function allocateBases(source: PlannerSource, ranked: Attraction[], request: PlanRequest, interests: Interest[]): BaseSegment[] {
  const pace = paceConfig[request.pace];
  const byBase = new Map<string, Attraction[]>();
  for (const attraction of ranked) {
    const key = source.bases.length === 1 ? source.bases[0]!.key : attraction.base;
    byBase.set(key, [...(byBase.get(key) ?? []), attraction]);
  }

  const scored = source.bases
    .map((base) => {
      const items = byBase.get(base.key) ?? [];
      const top = items.slice(0, pace.maxStops * 2);
      const value = top.reduce((sum, item) => sum + scoreAttraction(item, interests, request), 0);
      const needMin = top.reduce((sum, item) => sum + item.durationMin + 30, 0);
      const forced = items.some((item) => request.includePlaceIds.includes(item.id));
      return { base, items, value: forced ? value + 1000 : value, need: Math.max(1, needMin / pace.dayBudgetMin) };
    })
    .filter((entry) => entry.items.length > 0)
    .sort((a, b) => b.value - a.value);

  if (scored.length === 0) {
    const base = source.bases[0] ?? { key: "main", name: source.name, lat: source.center.lat, lon: source.center.lon };
    return [{ base, days: request.dayCount, stops: [] }];
  }

  const baseLimit = request.dayCount <= 2 ? 1 : request.dayCount <= 4 ? 2 : Math.ceil(request.dayCount / 2);
  const maxBases = Math.min(baseLimit, scored.length);
  const topValue = scored[0]!.value;
  const chosen = scored.slice(0, maxBases).filter((entry, index) => index === 0 || entry.value >= topValue * 0.35);

  const days = new Map(chosen.map((entry) => [entry.base.key, 1]));
  let remaining = request.dayCount - chosen.length;
  while (remaining > 0) {
    const neediest = [...chosen].sort(
      (a, b) => b.need - (days.get(b.base.key) ?? 0) - (a.need - (days.get(a.base.key) ?? 0)),
    )[0]!;
    days.set(neediest.base.key, (days.get(neediest.base.key) ?? 0) + 1);
    remaining -= 1;
  }

  // Route order: start at the gateway when it is part of the trip, then nearest-neighbour.
  const ordered: typeof chosen = [];
  const pending = [...chosen];
  const gatewayIndex = pending.findIndex((entry) => entry.base.key === source.gatewayBase);
  ordered.push(pending.splice(gatewayIndex >= 0 ? gatewayIndex : 0, 1)[0]!);
  while (pending.length > 0) {
    const last = ordered[ordered.length - 1]!.base;
    pending.sort((a, b) => haversineKm(last, a.base) - haversineKm(last, b.base));
    ordered.push(pending.shift()!);
  }

  return ordered.map((entry) => ({ base: entry.base, days: days.get(entry.base.key) ?? 1, stops: entry.items }));
}

function leisureStop(base: Base, index: number, interests: Interest[]): Attraction {
  const ideas: Array<{ name: string; interests: Interest[]; description: string }> = [
    { name: `Free afternoon in ${base.name}`, interests: ["relaxation"], description: "Unscheduled time to rest, revisit a favourite spot or wander without a plan." },
    { name: `Local market & café hopping in ${base.name}`, interests: ["shopping", "food"], description: "Browse local shops and try regional snacks at your own pace." },
    { name: `Spa, pool or wellness session`, interests: ["relaxation"], description: "Recharge with an Ayurvedic massage or a lazy afternoon at your hotel." },
  ];
  const preferred = ideas.find((idea, ideaIndex) => ideaIndex >= index % ideas.length && idea.interests.some((interest) => interests.includes(interest)));
  const idea = preferred ?? ideas[index % ideas.length]!;
  return {
    id: `leisure-${base.key}-${index}`,
    name: idea.name,
    area: base.name,
    base: base.key,
    type: "culture",
    interests: idea.interests,
    lat: base.lat,
    lon: base.lon,
    description: idea.description,
    openingHours: "",
    entryFeeInr: 0,
    durationMin: 150,
    bestTime: "afternoon",
    popularity: 1,
  };
}

/** Split a base's stops into `dayCount` geographically coherent days. */
function splitIntoDays(stops: Attraction[], start: LatLon, dayCount: number, firstDayBudget: number, dayBudget: number, maxStops: number) {
  // Nearest-neighbour chain from the hotel keeps nearby places together.
  const chain: Attraction[] = [];
  const remaining = [...stops];
  let position = start;
  while (remaining.length > 0) {
    remaining.sort((a, b) => haversineKm(position, a) - haversineKm(position, b));
    const next = remaining.shift()!;
    chain.push(next);
    position = next;
  }

  const days: Attraction[][] = Array.from({ length: dayCount }, () => []);
  let dayIndex = 0;
  let used = 0;
  position = start;
  for (const stop of chain) {
    const cost = stop.durationMin + estimateLeg(position, stop).durationMin;
    const budget = dayIndex === 0 ? firstDayBudget : dayBudget;
    const full = days[dayIndex]!.length >= maxStops || (used + cost > budget && days[dayIndex]!.length > 0);
    if (full) {
      if (dayIndex === dayCount - 1) break;
      dayIndex += 1;
      used = 0;
      position = start;
    }
    days[dayIndex]!.push(stop);
    used += stop.durationMin + estimateLeg(position, stop).durationMin;
    position = stop;
  }
  return days;
}

// ---------------------------------------------------------------------------
// Hotels & stays
// ---------------------------------------------------------------------------

function rankHotels(source: PlannerSource, base: Base, near: LatLon, style: TravelStyle, type: AccommodationType) {
  const candidates = source.hotels.filter((hotel) => hotel.base === base.key || source.bases.length === 1);
  const tierDistance = (tier: TravelStyle) => Math.abs(["budget", "mid", "premium"].indexOf(tier) - ["budget", "mid", "premium"].indexOf(style));
  return [...candidates].sort((a, b) => {
    const score = (hotel: CatalogHotel) =>
      tierDistance(hotel.tier) * 10 +
      (type !== "any" && hotel.type !== type ? 4 : 0) +
      haversineKm(near, hotel) * 0.4 -
      hotel.rating;
    return score(a) - score(b);
  });
}

function hotelOptions(source: PlannerSource, base: Base, near: LatLon, style: TravelStyle, type: AccommodationType): Hotel[] {
  const ranked = rankHotels(source, base, near, style, type);
  const options: Hotel[] = [];
  for (const tier of ["budget", "mid", "premium"] as const) {
    const inTier = ranked.filter((hotel) => hotel.tier === tier).slice(0, 3);
    if (inTier.length === 0) {
      options.push(placeholderHotel(base, tier));
    } else {
      options.push(...inTier.map((hotel) => toHotel(hotel, `${base.name}, India`)));
    }
  }
  return options;
}

function chooseHotel(source: PlannerSource, base: Base, near: LatLon, style: TravelStyle, type: AccommodationType): Hotel {
  const best = rankHotels(source, base, near, style, type)[0];
  if (best && best.tier === style) return toHotel(best, `${base.name}, India`);
  return placeholderHotel(base, style);
}

// ---------------------------------------------------------------------------
// Alternatives & costs
// ---------------------------------------------------------------------------

function computeAlternatives(day: TripDay, source: PlannerSource, usedIds: Set<string>, interests: Interest[], excluded: Set<string>): TripAlternative[] {
  const stops = day.activities.filter((activity) => activity.kind === "attraction" && activity.location);
  const center = centroid(stops.map((activity) => activity.location!)) ?? (day.baseKey ? source.bases.find((base) => base.key === day.baseKey) : null) ?? source.center;
  const rainy = isRainy(day.weather);
  const month = monthOf(day.date);

  return source.attractions
    .filter(
      (attraction) =>
        !usedIds.has(attraction.id) &&
        !excluded.has(attraction.id) &&
        isAvailable(attraction, month) &&
        !closedOn(attraction, day.date) &&
        (source.bases.length === 1 || attraction.base === day.baseKey),
    )
    .map((attraction) => {
      const distanceKm = haversineKm(center, attraction);
      const matches = attraction.interests.filter((interest) => interests.includes(interest));
      const score = distanceKm * 0.5 - matches.length * 2 - attraction.popularity * 0.5 - (rainy && attraction.indoor ? 6 : 0);
      let reason = `${round1(distanceKm)} km from today's route`;
      if (rainy && attraction.indoor) reason = "Indoor option if it rains";
      else if (attraction.type === "hidden-gem") reason = `Hidden gem · ${round1(distanceKm)} km away`;
      else if (matches.length > 0) reason = `Matches your interest in ${interestLabels[matches[0]!].toLowerCase()}`;
      return { attraction, distanceKm, score, reason };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(({ attraction, distanceKm, reason }) => ({
      placeId: attraction.id,
      name: attraction.name,
      category: attractionCategory(attraction),
      reason,
      distanceKm: round1(distanceKm),
    }));
}

export function computeCosts(itinerary: Pick<Itinerary, "days" | "stays" | "travelers" | "travelStyle">): CostBreakdown {
  const travelers = itinerary.travelers;
  const style = itinerary.travelStyle;
  const rooms = Math.ceil(travelers / 2);
  let accommodation = 0;
  let nights = 0;
  for (const stay of itinerary.stays) {
    nights += stay.nights;
    if (!stay.hotel) continue;
    const units = stay.hotel.type === "hostel" ? travelers : rooms;
    accommodation += stay.hotel.pricePerNightInr * stay.nights * units;
  }

  let food = 0;
  let sightseeing = 0;
  let activities = 0;
  let localTransport = 0;
  const rate = transportRates[style];
  const vehicles = rate.perPerson ? travelers : Math.ceil(travelers / rate.seatsPerVehicle);

  for (const day of itinerary.days) {
    for (const activity of day.activities) {
      if (activity.kind === "meal") food += activity.estCostInr;
      if (activity.kind === "attraction" || activity.kind === "leisure") {
        sightseeing += (activity.entryFeeInr ?? 0) * travelers;
        activities += (activity.activityFeeInr ?? 0) * travelers;
      }
    }
    localTransport += Math.max(day.travelKm * rate.perKm, rate.minPerDay) * vehicles;
  }

  const allowance = dailyAllowance[style];
  food += (allowance.breakfast + allowance.snacks) * travelers * itinerary.days.length;

  const subtotal = accommodation + food + localTransport + sightseeing + activities;
  const misc = Math.round(subtotal * miscRate);
  const total = Math.round(subtotal + misc);

  return {
    accommodation: Math.round(accommodation),
    food: Math.round(food),
    localTransport: Math.round(localTransport),
    sightseeing: Math.round(sightseeing),
    activities: Math.round(activities),
    misc,
    total,
    perPerson: Math.round(total / travelers),
    travelers,
    nights,
    rooms,
  };
}

function finalize(itinerary: Itinerary, source: PlannerSource, excluded: Set<string>): Itinerary {
  const used = new Set(itinerary.days.flatMap((day) => day.activities.map((activity) => activity.placeId).filter((id): id is string => Boolean(id))));
  const interests = normalizeInterests(itinerary.interests);
  for (const day of itinerary.days) {
    day.alternatives = computeAlternatives(day, source, used, interests, excluded);
    for (const activity of day.activities) {
      const catalog = source.attractions.find((attraction) => attraction.id === activity.placeId);
      if (catalog && closedOn(catalog, day.date)) activity.warning = `${closureText(catalog)} — consider moving it to another day.`;
      else delete activity.warning;
    }
  }
  const costs = computeCosts(itinerary);
  return { ...itinerary, costBreakdown: costs, budgetEstimateInr: costs.total };
}

// ---------------------------------------------------------------------------
// Seasonal context
// ---------------------------------------------------------------------------

export function seasonalWeather(season: SeasonInfo | null, date: string): TripWeather {
  const month = monthOf(date);
  const period = season?.periods.find((entry) => entry.months.includes(month));
  if (!period) {
    return { condition: "Seasonal data unavailable", tempHighC: 30, tempLowC: 20, source: "seasonal" };
  }
  const condition =
    period.rainfall === "low"
      ? "Mostly dry (seasonal average)"
      : period.rainfall === "moderate"
        ? "Chance of showers (seasonal average)"
        : "Rain likely (monsoon season)";
  return { condition, tempHighC: period.tempC[1], tempLowC: period.tempC[0], source: "seasonal" };
}

function seasonNote(season: SeasonInfo | null, startDate: string) {
  if (!season) return undefined;
  const month = monthOf(startDate);
  const period = season.periods.find((entry) => entry.months.includes(month));
  const monthName = new Date(`${startDate}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const verdict = season.bestMonths.includes(month) ? `${monthName} is one of the best months to visit.` : `${monthName} is outside the ideal season.`;
  return period ? `${verdict} ${period.name}: ${period.notes}` : verdict;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function planItinerary(source: PlannerSource, request: PlanRequest): Itinerary {
  const pace = paceConfig[request.pace];
  const interests = normalizeInterests(request.interests);
  const month = monthOf(request.startDate);
  const excluded = new Set(request.excludePlaceIds);
  const ctx: DayContext = { source, travelers: request.travelers, style: request.travelStyle, seed: request.seed, pace: request.pace, usedRestaurants: new Set() };

  const ranked = source.attractions
    .filter((attraction) => !excluded.has(attraction.id) && (isAvailable(attraction, month) || request.includePlaceIds.includes(attraction.id)))
    .sort((a, b) => scoreAttraction(b, interests, request) - scoreAttraction(a, interests, request));

  const segments = allocateBases(source, ranked, request, interests);
  const days: TripDay[] = [];
  const stays: Stay[] = [];
  let dayNumber = 1;
  let previousBase: Base | null = null;

  for (const [segmentIndex, segment] of segments.entries()) {
    const transferMin = previousBase ? estimateLeg(previousBase, segment.base, { hilly: source.hilly }).durationMin : 0;
    const firstDayBudget = Math.max(90, pace.dayBudgetMin - transferMin);
    const capacity = firstDayBudget + pace.dayBudgetMin * (segment.days - 1);

    // Pick the best-scoring stops that fit the time available in this base.
    const picked: Attraction[] = [];
    let used = 0;
    for (const stop of segment.stops) {
      const cost = stop.durationMin + 30;
      if (used + cost > capacity * 1.05 && picked.length > 0 && !request.includePlaceIds.includes(stop.id)) continue;
      if (stop.durationMin > pace.dayBudgetMin && !request.includePlaceIds.includes(stop.id)) continue;
      picked.push(stop);
      used += cost;
    }

    const stopsCentroid = centroid(picked) ?? segment.base;
    const hotel = chooseHotel(source, segment.base, stopsCentroid, request.travelStyle, request.accommodationType);
    const dayGroups = splitIntoDays(picked, hotel, segment.days, firstDayBudget, pace.dayBudgetMin, pace.maxStops);
    avoidClosures(dayGroups, addDays(request.startDate, dayNumber - 1));

    const leisureIds = new Set<string>();
    dayGroups.forEach((group, groupIndex) => {
      const budget = groupIndex === 0 ? firstDayBudget : pace.dayBudgetMin;
      const usedMin = group.reduce((sum, stop) => sum + stop.durationMin + 30, 0);
      if (budget - usedMin >= 180 || group.length === 0) {
        const leisure = leisureStop(segment.base, dayNumber + groupIndex, interests);
        leisureIds.add(leisure.id);
        group.push(leisure);
      }
    });

    const isLastSegment = segmentIndex === segments.length - 1;
    stays.push({
      baseKey: segment.base.key,
      baseName: segment.base.name,
      nights: isLastSegment ? segment.days - 1 : segment.days,
      checkIn: addDays(request.startDate, dayNumber - 1),
      hotel,
      options: hotelOptions(source, segment.base, stopsCentroid, request.travelStyle, request.accommodationType),
    });

    dayGroups.forEach((group, groupIndex) => {
      const date = addDays(request.startDate, dayNumber - 1);
      days.push(
        scheduleDay(
          {
            dayNumber,
            date,
            base: segment.base,
            hotelLocation: hotel,
            stops: group,
            leisureIds,
            transferFrom: groupIndex === 0 ? previousBase : null,
            weather: request.weather[dayNumber - 1] ?? seasonalWeather(source.season, date),
            preserveOrder: false,
          },
          ctx,
        ),
      );
      dayNumber += 1;
    });

    previousBase = segment.base;
  }

  const endDate = addDays(request.startDate, request.dayCount - 1);
  const interestText = interests.length > 0 ? interests.map((interest) => interestLabels[interest].toLowerCase()).join(", ") : "local highlights";
  const baseNames = stays.map((stay) => stay.baseName);
  const route = baseNames.length > 1 ? ` via ${baseNames.join(" → ")}` : "";

  const itinerary: Itinerary = {
    tripId: `${source.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
    tripTitle: `${request.dayCount}-Day ${source.name} Itinerary`,
    destination: source.name,
    destinationKey: source.key,
    startDate: request.startDate,
    endDate,
    budgetEstimateInr: 0,
    generatedAt: new Date().toISOString(),
    summary: `A ${request.pace}-paced ${request.travelStyle === "mid" ? "mid-range" : request.travelStyle} trip${route} focused on ${interestText}.`,
    travelers: request.travelers,
    travelStyle: request.travelStyle,
    accommodationType: request.accommodationType,
    pace: request.pace,
    interests: request.interests,
    seed: request.seed,
    dataQuality: source.dataQuality,
    center: { name: source.name, lat: source.center.lat, lon: source.center.lon },
    mustTryDishes: source.mustTryDishes,
    stays,
    days,
  };
  if (request.budgetInr !== undefined) itinerary.budgetInr = request.budgetInr;
  const note = seasonNote(source.season, request.startDate);
  if (note) itinerary.seasonNote = note;

  return finalize(itinerary, source, excluded);
}

// ---------------------------------------------------------------------------
// Editing an existing itinerary
// ---------------------------------------------------------------------------

export type EditableDay = {
  stops: Attraction[];
  leisureIds: Set<string>;
  lunch?: Restaurant | undefined;
  dinner?: Restaurant | undefined;
  transferFrom: Base | null;
};

/** Turn a scheduled day back into editable parts. */
export function decomposeDay(day: TripDay, source: PlannerSource): EditableDay {
  const fallback = source.bases.find((base) => base.key === day.baseKey) ?? source.center;
  const stops: Attraction[] = [];
  const leisureIds = new Set<string>();
  let lunch: Restaurant | undefined;
  let dinner: Restaurant | undefined;
  let transferFrom: Base | null = null;

  for (const activity of day.activities) {
    if (activity.kind === "meal") {
      const restaurant = source.restaurants.find((entry) => entry.id === activity.placeId) ?? restaurantFromActivity(activity, fallback);
      if (parseClock(activity.time) < 16 * 60 && !lunch) lunch = restaurant;
      else dinner = restaurant;
    } else if (activity.kind === "transfer") {
      const fromName = activity.title.replace(/^Transfer /, "").split(" → ")[0];
      transferFrom = source.bases.find((base) => base.name === fromName) ?? null;
    } else {
      const catalog = source.attractions.find((entry) => entry.id === activity.placeId);
      const stop = catalog ?? attractionFromActivity(activity, fallback);
      if (activity.kind === "leisure") leisureIds.add(stop.id);
      stops.push(stop);
    }
  }
  return { stops, leisureIds, lunch, dinner, transferFrom };
}

export function rescheduleDay(itinerary: Itinerary, dayIndex: number, edit: EditableDay, source: PlannerSource, usedRestaurants: Set<string>) {
  const day = itinerary.days[dayIndex]!;
  const base = source.bases.find((entry) => entry.key === day.baseKey) ?? source.bases[0] ?? { key: "main", name: source.name, lat: source.center.lat, lon: source.center.lon };
  const stay = itinerary.stays.find((entry) => entry.baseKey === base.key);
  const hotelLocation: LatLon = stay?.hotel ?? base;
  const ctx: DayContext = { source, travelers: itinerary.travelers, style: itinerary.travelStyle, seed: itinerary.seed, pace: itinerary.pace, usedRestaurants };

  itinerary.days[dayIndex] = scheduleDay(
    {
      dayNumber: day.dayNumber,
      date: day.date,
      base,
      hotelLocation,
      stops: edit.stops,
      leisureIds: edit.leisureIds,
      transferFrom: edit.transferFrom,
      weather: day.weather,
      keepMeals: { lunch: edit.lunch, dinner: edit.dinner },
      preserveOrder: true,
    },
    ctx,
  );
}

/** Cheapest-insertion position for a new stop in an ordered route. */
export function bestInsertIndex(stops: Attraction[], start: LatLon, candidate: Attraction) {
  if (stops.length === 0) return 0;
  let bestIndex = stops.length;
  let bestCost = Number.POSITIVE_INFINITY;
  const points: LatLon[] = [start, ...stops];
  for (let index = 0; index <= stops.length; index += 1) {
    const before = points[index]!;
    const after = stops[index];
    const added = haversineKm(before, candidate) + (after ? haversineKm(candidate, after) - haversineKm(before, after) : 0);
    const timePenalty = after && bestTimeOrder[after.bestTime] < bestTimeOrder[candidate.bestTime] ? 5 : 0;
    if (added + timePenalty < bestCost) {
      bestCost = added + timePenalty;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function pickReplacementRestaurant(itinerary: Itinerary, dayIndex: number, current: Restaurant, slot: "lunch" | "dinner", source: PlannerSource) {
  const day = itinerary.days[dayIndex]!;
  const base = source.bases.find((entry) => entry.key === day.baseKey) ?? source.bases[0]!;
  const used = new Set(itinerary.days.flatMap((entry) => entry.activities.filter((activity) => activity.kind === "meal").map((activity) => activity.placeId ?? "")));
  const ctx: DayContext = { source, travelers: itinerary.travelers, style: itinerary.travelStyle, seed: itinerary.seed + 7, pace: itinerary.pace, usedRestaurants: used };
  const exclude = new Set([current.id]);
  const replacement = pickRestaurant(ctx, base, current, slot, exclude);
  return replacement.id.startsWith("generic-") || replacement.id === current.id ? null : replacement;
}

export function refreshItinerary(itinerary: Itinerary, source: PlannerSource, excluded: string[] = []) {
  return finalize(itinerary, source, new Set(excluded));
}

export function hotelById(source: PlannerSource, itinerary: Itinerary, baseKey: string, hotelId: string): Hotel | null {
  const stay = itinerary.stays.find((entry) => entry.baseKey === baseKey);
  const fromOptions = stay?.options.find((option) => option.id === hotelId);
  if (fromOptions) return fromOptions;
  const catalog = source.hotels.find((hotel) => hotel.id === hotelId);
  const base = source.bases.find((entry) => entry.key === baseKey);
  return catalog ? toHotel(catalog, `${base?.name ?? source.name}, India`) : null;
}

export { seasonNote };
