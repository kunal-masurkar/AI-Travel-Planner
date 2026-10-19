import type { TripWeather } from "@ai-travel-planner/shared";
import { getProviderConfig } from "../config/providers.js";
import { findDestination } from "../data/catalog.js";
import type { Attraction, CatalogHotel, Restaurant } from "../data/types.js";
import type { PlannerSource } from "./planner.js";

export type GeoPoint = {
  name: string;
  lat: number;
  lon: number;
};

const fallbackIndia: GeoPoint = { name: "India", lat: 20.5937, lon: 78.9629 };

const fallbackLocations: Record<string, GeoPoint> = {
  kolkata: { name: "Kolkata", lat: 22.5726, lon: 88.3639 },
  rishikesh: { name: "Rishikesh", lat: 30.0869, lon: 78.2676 },
  ooty: { name: "Ooty", lat: 11.4102, lon: 76.695 },
  darjeeling: { name: "Darjeeling", lat: 27.041, lon: 88.2663 },
  leh: { name: "Leh", lat: 34.1526, lon: 77.5771 },
  ladakh: { name: "Leh", lat: 34.1526, lon: 77.5771 },
  amritsar: { name: "Amritsar", lat: 31.634, lon: 74.8723 },
  hyderabad: { name: "Hyderabad", lat: 17.385, lon: 78.4867 },
  bengaluru: { name: "Bengaluru", lat: 12.9716, lon: 77.5946 },
  bangalore: { name: "Bengaluru", lat: 12.9716, lon: 77.5946 },
  chennai: { name: "Chennai", lat: 13.0827, lon: 80.2707 },
  mysore: { name: "Mysuru", lat: 12.2958, lon: 76.6394 },
  hampi: { name: "Hampi", lat: 15.335, lon: 76.46 },
  pondicherry: { name: "Puducherry", lat: 11.9416, lon: 79.8083 },
  jodhpur: { name: "Jodhpur", lat: 26.2389, lon: 73.0243 },
  jaisalmer: { name: "Jaisalmer", lat: 26.9157, lon: 70.9083 },
};

function pickFallbackPoint(destination: string): GeoPoint | null {
  const destinationKey = destination.toLowerCase();
  const match = Object.entries(fallbackLocations).find(([key]) => destinationKey.includes(key));
  return match ? match[1] : null;
}

export async function geocodeDestination(destination: string): Promise<GeoPoint> {
  const curated = findDestination(destination);
  if (curated) {
    return { name: curated.name, ...curated.center };
  }

  const fallbackPoint = pickFallbackPoint(destination) ?? { ...fallbackIndia, name: titleCase(destination) };
  if (getProviderConfig().geocodingProvider !== "nominatim") {
    return fallbackPoint;
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("q", `${destination}, India`);

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "India-Travel-Planner/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return fallbackPoint;

    const results = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    const result = results[0];
    if (!result) return fallbackPoint;

    return {
      name: result.display_name.split(",")[0] ?? fallbackPoint.name,
      lat: Number(result.lat),
      lon: Number(result.lon),
    };
  } catch {
    return fallbackPoint;
  }
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function weatherCodeToCondition(code: number) {
  if (code === 0) return "Clear & Sunny";
  if ([1, 2].includes(code)) return "Mostly Clear";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Morning Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Light Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain Showers";
  if ([71, 73, 75, 77].includes(code)) return "Snowfall";
  if ([80, 81, 82].includes(code)) return "Passing Showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Pleasant";
}

type DailyWeather = {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
};

async function fetchDaily(baseUrl: string, point: { lat: number; lon: number }, startDate: string, endDate: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("longitude", String(point.lon));
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);

  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) return null;
  const data = (await response.json()) as DailyWeather;
  return data.daily ?? null;
}

function shiftYear(isoDate: string, years: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

/**
 * Daily weather for the trip. Uses the live forecast when the dates are within
 * Open-Meteo's 16-day window; otherwise uses the same dates last year as a
 * "typical weather" proxy. Returns an empty array when neither is available,
 * so callers can fall back to seasonal averages.
 */
export async function fetchWeatherDays(startDate: string, endDate: string, point: { lat: number; lon: number }): Promise<TripWeather[]> {
  const daysAhead = (Date.parse(`${startDate}T00:00:00Z`) - Date.now()) / 86_400_000;

  try {
    if (daysAhead > -1 && daysAhead < 14) {
      const daily = await fetchDaily("https://api.open-meteo.com/v1/forecast", point, startDate, endDate);
      if (daily) {
        return daily.time.map((_date, index) => ({
          condition: weatherCodeToCondition(daily.weather_code[index] ?? 0),
          tempHighC: Math.round(daily.temperature_2m_max[index] ?? 0),
          tempLowC: Math.round(daily.temperature_2m_min[index] ?? 0),
          source: "forecast" as const,
        }));
      }
    }

    const yearsBack = daysAhead > -2 ? -1 : 0;
    if (yearsBack === 0) return [];
    const daily = await fetchDaily(
      "https://archive-api.open-meteo.com/v1/archive",
      point,
      shiftYear(startDate, yearsBack),
      shiftYear(endDate, yearsBack),
    );
    if (!daily) return [];
    return daily.time.map((_date, index) => ({
      condition: `Typically ${weatherCodeToCondition(daily.weather_code[index] ?? 0).toLowerCase()}`,
      tempHighC: Math.round(daily.temperature_2m_max[index] ?? 0),
      tempLowC: Math.round(daily.temperature_2m_min[index] ?? 0),
      source: "seasonal" as const,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Live places for destinations outside the curated catalog
// ---------------------------------------------------------------------------

type GeoapifyFeature = {
  properties?: {
    place_id?: string;
    name?: string;
    formatted?: string;
    address_line2?: string;
    suburb?: string;
    lat?: number;
    lon?: number;
    categories?: string[];
    opening_hours?: string;
    catering?: { cuisine?: string };
    accommodation?: { stars?: number };
    wiki_and_media?: { wikipedia?: string };
  };
};

async function geoapifyPlaces(point: GeoPoint, categories: string, limit: number, radiusM: number): Promise<GeoapifyFeature[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const url = new URL("https://api.geoapify.com/v2/places");
    url.searchParams.set("categories", categories);
    url.searchParams.set("filter", `circle:${point.lon},${point.lat},${radiusM}`);
    url.searchParams.set("bias", `proximity:${point.lon},${point.lat}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const data = (await response.json()) as { features?: GeoapifyFeature[] };
    return (data.features ?? []).filter(
      (feature) => feature.properties?.name && typeof feature.properties.lat === "number" && typeof feature.properties.lon === "number",
    );
  } catch {
    return [];
  }
}

function wikiTitle(value: string | undefined) {
  if (!value) return undefined;
  const title = value.includes(":") ? value.split(":").slice(1).join(":") : value;
  return title || undefined;
}

function attractionFromFeature(feature: GeoapifyFeature, baseKey: string, index: number): Attraction {
  const properties = feature.properties!;
  const categories = properties.categories ?? [];
  const has = (prefix: string) => categories.some((category) => category.startsWith(prefix));
  const type: Attraction["type"] = has("religion")
    ? "spiritual"
    : has("entertainment.museum")
      ? "museum"
      : has("beach")
        ? "beach"
        : has("leisure.park") || has("natural")
          ? "nature"
          : has("commercial")
            ? "shopping"
            : has("heritage") || has("tourism.sights.castle") || has("tourism.sights.fort")
              ? "historical"
              : "landmark";

  const interestsByType: Partial<Record<Attraction["type"], Attraction["interests"]>> = {
    spiritual: ["spiritual", "culture"],
    museum: ["history", "culture"],
    beach: ["beaches", "relaxation"],
    nature: ["nature"],
    shopping: ["shopping"],
    historical: ["history"],
  };
  const interests = interestsByType[type] ?? ["culture", "history"];

  const attraction: Attraction = {
    id: `live-${properties.place_id ?? index}`,
    name: properties.name!,
    area: properties.suburb ?? properties.address_line2?.split(",")[0] ?? "",
    base: baseKey,
    type,
    interests,
    lat: properties.lat!,
    lon: properties.lon!,
    description: properties.formatted ?? "",
    openingHours: properties.opening_hours ?? "Check locally",
    entryFeeInr: 0,
    durationMin: type === "museum" ? 90 : type === "nature" || type === "beach" ? 100 : 60,
    bestTime: type === "beach" ? "sunset" : type === "spiritual" ? "morning" : "any",
    popularity: Math.max(2, 4 - Math.floor(index / 5)),
  };
  const wiki = wikiTitle(properties.wiki_and_media?.wikipedia);
  if (wiki) attraction.wiki = wiki;
  if (type === "museum") attraction.indoor = true;
  return attraction;
}

export async function buildLiveSource(destination: string): Promise<PlannerSource> {
  const point = await geocodeDestination(destination);
  const baseKey = point.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "main";
  const base = { key: baseKey, name: point.name, lat: point.lat, lon: point.lon };

  const [sights, food, stays] = await Promise.all([
    geoapifyPlaces(point, "tourism.sights,tourism.attraction,entertainment.museum,leisure.park,religion.place_of_worship,beach", 30, 15000),
    geoapifyPlaces(point, "catering.restaurant,catering.cafe", 20, 8000),
    geoapifyPlaces(point, "accommodation.hotel,accommodation.hostel,accommodation.guest_house", 15, 8000),
  ]);

  const seen = new Set<string>();
  const attractions = sights
    .filter((feature) => {
      const name = feature.properties!.name!.toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((feature, index) => attractionFromFeature(feature, baseKey, index));

  const restaurants: Restaurant[] = food.map((feature, index) => {
    const properties = feature.properties!;
    const isCafe = (properties.categories ?? []).includes("catering.cafe");
    const tier = index % 3 === 0 ? "budget" : index % 3 === 1 ? "mid" : "premium";
    return {
      id: `live-food-${properties.place_id ?? index}`,
      name: properties.name!,
      area: properties.suburb ?? "",
      base: baseKey,
      lat: properties.lat!,
      lon: properties.lon!,
      cuisine: properties.catering?.cuisine?.replaceAll(";", ", ").replaceAll("_", " ") ?? (isCafe ? "Café" : "Local cuisine"),
      specialties: [],
      priceTier: tier,
      costForTwoInr: tier === "budget" ? 500 : tier === "mid" ? 1200 : 2800,
      rating: 0,
      openingHours: properties.opening_hours ?? "",
      familyFriendly: true,
      snackOnly: isCafe,
    };
  });

  const hotels: CatalogHotel[] = stays.map((feature, index) => {
    const properties = feature.properties!;
    const categories = properties.categories ?? [];
    const stars = properties.accommodation?.stars ?? 0;
    const type: CatalogHotel["type"] = categories.includes("accommodation.hostel")
      ? "hostel"
      : categories.includes("accommodation.guest_house")
        ? "homestay"
        : "hotel";
    const tier: CatalogHotel["tier"] = type === "hostel" ? "budget" : stars >= 5 ? "premium" : stars >= 3 ? "mid" : index % 2 === 0 ? "mid" : "budget";
    return {
      id: `live-stay-${properties.place_id ?? index}`,
      name: properties.name!,
      type,
      tier,
      base: baseKey,
      area: properties.suburb ?? point.name,
      lat: properties.lat!,
      lon: properties.lon!,
      pricePerNightInr: type === "hostel" ? 700 : tier === "premium" ? 12000 : tier === "mid" ? 4500 : 1800,
      rating: 0,
      amenities: [],
      description: properties.formatted ?? "",
    };
  });

  const hasLiveData = attractions.length >= 3;
  return {
    key: null,
    name: point.name,
    center: point,
    hilly: false,
    gatewayBase: baseKey,
    bases: [base],
    attractions: hasLiveData ? attractions : genericAttractions(base),
    restaurants,
    hotels,
    season: null,
    mustTryDishes: [],
    dataQuality: hasLiveData ? "live" : "generic",
  };
}

/** Placeholder ideas used when no live places provider is configured. */
function genericAttractions(base: { key: string; name: string; lat: number; lon: number }): Attraction[] {
  const at = (offsetLat: number, offsetLon: number) => ({ lat: base.lat + offsetLat, lon: base.lon + offsetLon });
  const ideas: Array<Omit<Attraction, "base" | "lat" | "lon" | "openingHours" | "entryFeeInr" | "popularity"> & { offset: [number, number] }> = [
    { id: "generic-old-town", name: `${base.name} Old Town Heritage Walk`, area: "Old Town", type: "historical", interests: ["history", "culture"], description: "Explore the historic core, landmark buildings and morning street life.", durationMin: 120, bestTime: "morning", offset: [0.004, 0.004] },
    { id: "generic-museum", name: `${base.name} City Museum`, area: "City Centre", type: "museum", interests: ["history", "culture"], description: "Get context on local history, art and crafts.", durationMin: 90, bestTime: "afternoon", indoor: true, offset: [-0.006, 0.003] },
    { id: "generic-market", name: `${base.name} Main Bazaar`, area: "Market District", type: "shopping", interests: ["shopping", "food"], description: "Browse handicrafts, spices and regional textiles.", durationMin: 90, bestTime: "afternoon", offset: [0.002, -0.006] },
    { id: "generic-temple", name: `Prominent temple or shrine in ${base.name}`, area: "Old Town", type: "spiritual", interests: ["spiritual", "culture"], description: "Visit a revered local place of worship; dress modestly.", durationMin: 60, bestTime: "morning", offset: [0.008, -0.002] },
    { id: "generic-park", name: `${base.name} Gardens & Lakeside`, area: "Green Belt", type: "nature", interests: ["nature", "relaxation"], description: "Relaxing stroll through parks, a riverfront or lakeside.", durationMin: 90, bestTime: "afternoon", offset: [-0.01, -0.008] },
    { id: "generic-viewpoint", name: `${base.name} Sunset Viewpoint`, area: "Viewpoint", type: "landmark", interests: ["nature", "relaxation"], description: "Golden-hour views over the city or countryside.", durationMin: 60, bestTime: "sunset", offset: [0.015, 0.012] },
    { id: "generic-food-street", name: `${base.name} Evening Food Street`, area: "Food Street", type: "culture", interests: ["food", "nightlife"], description: "Sample local street food and regional sweets.", durationMin: 90, bestTime: "evening", offset: [-0.003, 0.009] },
    { id: "generic-crafts", name: `${base.name} Artisan Workshop Visit`, area: "Craft Quarter", type: "culture", interests: ["culture", "shopping"], description: "Meet local artisans and watch traditional crafts being made.", durationMin: 90, bestTime: "morning", offset: [0.012, -0.011] },
  ];
  return ideas.map(({ offset, ...idea }) => ({
    ...idea,
    base: base.key,
    ...at(offset[0], offset[1]),
    openingHours: "Check locally",
    entryFeeInr: 0,
    popularity: 3,
  }));
}
