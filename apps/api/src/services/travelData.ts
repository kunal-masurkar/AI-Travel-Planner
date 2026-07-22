import { getProviderConfig } from "../config/providers.js";

export type GeoPoint = {
  name: string;
  lat: number;
  lon: number;
};

export type PlacePoint = GeoPoint & {
  address?: string;
};

export type WeatherDay = {
  date: string;
  condition: string;
  tempHighC: number;
  tempLowC: number;
};

const fallbackIndia: GeoPoint = { name: "India", lat: 20.5937, lon: 78.9629 };

const fallbackLocations: Record<string, GeoPoint> = {
  delhi: { name: "Delhi", lat: 28.6139, lon: 77.209 },
  mumbai: { name: "Mumbai", lat: 19.076, lon: 72.8777 },
  jaipur: { name: "Jaipur", lat: 26.9124, lon: 75.7873 },
  goa: { name: "Goa", lat: 15.2993, lon: 74.124 },
  udaipur: { name: "Udaipur", lat: 24.5854, lon: 73.7125 },
  kerala: { name: "Kerala", lat: 10.8505, lon: 76.2711 },
  varanasi: { name: "Varanasi", lat: 25.3176, lon: 82.9739 },
  kolkata: { name: "Kolkata", lat: 22.5726, lon: 88.3639 },
  himachal: { name: "Himachal Pradesh", lat: 31.1048, lon: 77.1734 },
  india: fallbackIndia,
};

function pickFallbackPoint(destination: string): GeoPoint {
  const destinationKey = destination.toLowerCase();
  const match = Object.entries(fallbackLocations).find(([key]) => destinationKey.includes(key));
  if (match) {
    return match[1] as GeoPoint;
  }

  return fallbackIndia;
}

function weatherCodeToCondition(code: number) {
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Mostly clear";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Showers";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Mixed";
}

export async function geocodeDestination(destination: string): Promise<GeoPoint> {
  const providers = getProviderConfig();
  const fallbackPoint = pickFallbackPoint(destination);

  if (providers.geocodingProvider !== "nominatim") {
    return fallbackPoint;
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("q", `${destination}, India`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "India-Travel-Planner/1.0",
      },
    });

    if (!response.ok) {
      return fallbackPoint;
    }

    const results = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    const result = results[0];

    if (!result) {
      return fallbackPoint;
    }

    return {
      name: result.display_name.split(",")[0] ?? fallbackPoint.name,
      lat: Number(result.lat),
      lon: Number(result.lon),
    };
  } catch {
    return fallbackPoint;
  }
}

export async function fetchWeatherDays(startDate: string, endDate: string, point: GeoPoint): Promise<WeatherDay[]> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(point.lat));
    url.searchParams.set("longitude", String(point.lon));
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Weather request failed");
    }

    const data = (await response.json()) as {
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
      };
    };

    const daily = data.daily;
    if (!daily) {
      throw new Error("Missing weather data");
    }

    return daily.time.map((date, index) => ({
      date,
      condition: weatherCodeToCondition(daily.weather_code[index] ?? 0),
      tempHighC: Math.round(daily.temperature_2m_max[index] ?? 0),
      tempLowC: Math.round(daily.temperature_2m_min[index] ?? 0),
    }));
  } catch {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

    return Array.from({ length: days }, (_unused, index) => ({
      date: new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10),
      condition: index % 2 === 0 ? "Clear" : "Cloudy",
      tempHighC: 28 + (index % 3),
      tempLowC: 20 + (index % 2),
    }));
  }
}

export async function fetchGeoapifyPlaces(point: GeoPoint) {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) {
    return [] as PlacePoint[];
  }

  const categories = [
    "tourism.sights",
    "catering.restaurant",
    "catering.cafe",
    "tourism.attraction",
    "leisure.park",
    "entertainment.culture",
  ].join(",");

  try {
    const url = new URL("https://api.geoapify.com/v2/places");
    url.searchParams.set("categories", categories);
    url.searchParams.set("filter", `circle:${point.lon},${point.lat},8000`);
    url.searchParams.set("bias", `proximity:${point.lon},${point.lat}`);
    url.searchParams.set("limit", "18");
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      return [] as PlacePoint[];
    }

    const data = (await response.json()) as {
      features?: Array<{
        properties?: {
          name?: string;
          formatted?: string;
          address_line1?: string;
          lat?: number;
          lon?: number;
        };
      }>;
    };

    return (data.features ?? [])
      .map((feature) => {
        const properties = feature.properties;
        if (!properties?.name || typeof properties.lat !== "number" || typeof properties.lon !== "number") {
          return null;
        }

        const place: PlacePoint = {
          name: properties.name,
          lat: properties.lat,
          lon: properties.lon,
        };

        const address = properties.formatted ?? properties.address_line1;
        if (address) {
          place.address = address;
        }

        return place;
      })
      .filter((place): place is PlacePoint => place !== null);
  } catch {
    return [] as PlacePoint[];
  }
}
