import type { Destination } from "./types.js";
import { agra } from "./destinations/agra.js";
import { delhi } from "./destinations/delhi.js";
import { goa } from "./destinations/goa.js";
import { himachal } from "./destinations/himachal.js";
import { jaipur } from "./destinations/jaipur.js";
import { kerala } from "./destinations/kerala.js";
import { mumbai } from "./destinations/mumbai.js";
import { udaipur } from "./destinations/udaipur.js";
import { varanasi } from "./destinations/varanasi.js";

export const destinations: Destination[] = [goa, jaipur, kerala, udaipur, varanasi, himachal, delhi, mumbai, agra];

const byKey = new Map(destinations.map((destination) => [destination.key, destination]));

export function getDestination(key: string): Destination | null {
  return byKey.get(key) ?? null;
}

/** Match free text such as "Fort Kochi, Kerala" or "manali" to a curated destination. */
export function findDestination(query: string): Destination | null {
  const text = query.toLowerCase().trim();
  if (!text) return null;

  const exact = destinations.find(
    (destination) =>
      destination.key === text ||
      destination.name.toLowerCase() === text ||
      destination.aliases.includes(text),
  );
  if (exact) return exact;

  return (
    destinations.find(
      (destination) =>
        text.includes(destination.key) ||
        text.includes(destination.name.toLowerCase()) ||
        destination.aliases.some((alias) => text.includes(alias)),
    ) ?? null
  );
}

export function searchDestinations(query: string): Destination[] {
  const text = query.toLowerCase().trim();
  if (!text) return destinations;
  return destinations.filter(
    (destination) =>
      destination.name.toLowerCase().includes(text) ||
      destination.state.toLowerCase().includes(text) ||
      destination.aliases.some((alias) => alias.includes(text)) ||
      destination.attractions.some((attraction) => attraction.name.toLowerCase().includes(text)),
  );
}
