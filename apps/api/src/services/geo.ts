import type { Itinerary, TravelLeg } from "@ai-travel-planner/shared";
import { redis } from "../store/redis.js";

export type LatLon = { lat: number; lon: number };

export function haversineKm(a: LatLon, b: LatLon) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Fast straight-line + road inflation heuristic for planning passes and fallbacks.
 */
export function estimateLeg(from: LatLon, to: LatLon, options: { hilly?: boolean } = {}): TravelLeg {
  const straight = haversineKm(from, to);
  if (straight < 0.6) {
    return { distanceKm: round1(straight * 1.2), durationMin: Math.max(3, Math.round((straight * 1.2 * 60) / 4.5)), mode: "walk" };
  }

  const roadFactor = options.hilly ? 1.6 : 1.35;
  const distanceKm = straight * roadFactor;
  let speedKmh = distanceKm < 8 ? 18 : distanceKm < 30 ? 25 : 40;
  if (options.hilly) speedKmh *= 0.7;

  return {
    distanceKm: round1(distanceKm),
    durationMin: Math.max(5, Math.round((distanceKm / speedKmh) * 60) + 5),
    mode: distanceKm < 8 ? "auto" : "car",
  };
}

export function centroid(points: LatLon[]): LatLon | null {
  if (points.length === 0) return null;
  const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }), { lat: 0, lon: 0 });
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

export function round1(value: number) {
  return Math.round(value * 10) / 10;
}

// In-memory cache for fast repeated hops
const localRouteCache = new Map<string, TravelLeg>();

/**
 * Fetches accurate driving distance and duration from Geoapify Routing API.
 * Uses Redis & memory caching to minimize quota usage.
 * Falls back to estimateLeg on timeout or errors.
 */
export async function fetchRealRoadLeg(
  from: LatLon,
  to: LatLon,
  options: { hilly?: boolean } = {}
): Promise<TravelLeg> {
  const straight = haversineKm(from, to);
  if (straight < 0.5) {
    return {
      distanceKm: round1(straight * 1.2),
      durationMin: Math.max(3, Math.round((straight * 1.2 * 60) / 4.5)),
      mode: "walk",
    };
  }

  const cacheKey = `route:${from.lat.toFixed(4)},${from.lon.toFixed(4)}:${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;

  // 1. Check local cache
  const inMemory = localRouteCache.get(cacheKey);
  if (inMemory) return inMemory;

  // 2. Check Redis cache
  if (redis && redis.status === "ready") {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as TravelLeg;
        localRouteCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {
      // Ignore cache retrieval errors
    }
  }

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) {
    return estimateLeg(from, to, options);
  }

  try {
    const url = new URL("https://api.geoapify.com/v1/routing");
    url.searchParams.set("waypoints", `${from.lat},${from.lon}|${to.lat},${to.lon}`);
    url.searchParams.set("mode", "drive");
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) {
      return estimateLeg(from, to, options);
    }

    const data = (await response.json()) as any;
    const props = data?.features?.[0]?.properties;
    if (!props || typeof props.distance !== "number" || typeof props.time !== "number") {
      return estimateLeg(from, to, options);
    }

    const distanceKm = round1(props.distance / 1000);
    const durationMin = Math.max(3, Math.round(props.time / 60));
    const mode = distanceKm < 6 ? "auto" : "car";

    const leg: TravelLeg = { distanceKm, durationMin, mode };

    // Store in local and Redis cache (7 days TTL)
    localRouteCache.set(cacheKey, leg);
    if (redis && redis.status === "ready") {
      void redis.set(cacheKey, JSON.stringify(leg), "EX", 7 * 24 * 3600).catch(() => {});
    }

    return leg;
  } catch (err) {
    // Fail gracefully back to geometric estimate
    return estimateLeg(from, to, options);
  }
}

/**
 * Enriches all legs in an itinerary with real road routing data from Geoapify.
 */
export async function enrichItineraryWithRealRouting(itinerary: Itinerary): Promise<Itinerary> {
  const isHilly = itinerary.destinationKey === "manali" || itinerary.destinationKey === "munnar";

  // Process all days in parallel
  await Promise.all(
    itinerary.days.map(async (day) => {
      let previousPoint: LatLon | null = null;
      let dayKm = 0;
      let dayMin = 0;

      for (const activity of day.activities) {
        const currentLoc = activity.location ? { lat: activity.location.lat, lon: activity.location.lon } : null;

        if (activity.travelFromPrev && previousPoint && currentLoc) {
          const realLeg = await fetchRealRoadLeg(previousPoint, currentLoc, { hilly: isHilly });
          activity.travelFromPrev = realLeg;
          dayKm += realLeg.distanceKm;
          dayMin += realLeg.durationMin;
        } else if (activity.travelFromPrev) {
          dayKm += activity.travelFromPrev.distanceKm;
          dayMin += activity.travelFromPrev.durationMin;
        }

        if (currentLoc) {
          previousPoint = currentLoc;
        }
      }

      day.travelKm = round1(dayKm);
      day.travelMin = Math.round(dayMin);
    })
  );

  return itinerary;
}
