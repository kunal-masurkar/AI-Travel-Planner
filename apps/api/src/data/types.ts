import type { BestTime, Interest, TravelStyle } from "@ai-travel-planner/shared";

export type AttractionType =
  | "landmark"
  | "historical"
  | "nature"
  | "adventure"
  | "hidden-gem"
  | "beach"
  | "culture"
  | "spiritual"
  | "shopping"
  | "museum";

export interface Base {
  key: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Attraction {
  id: string;
  name: string;
  /** Neighbourhood or locality, used for display and day themes. */
  area: string;
  /** Key of the base (overnight town) this attraction is visited from. */
  base: string;
  type: AttractionType;
  interests: Interest[];
  lat: number;
  lon: number;
  description: string;
  openingHours: string;
  /** Indicative per-person entry ticket for Indian adults. */
  entryFeeInr: number;
  /** Indicative per-person cost of the experience itself (boat, show, safari...). */
  activityFeeInr?: number;
  /** Time spent on site, excluding travel. */
  durationMin: number;
  bestTime: BestTime;
  /** 1 (niche) to 5 (unmissable). */
  popularity: number;
  indoor?: boolean;
  includesMeal?: "lunch" | "dinner";
  /** English Wikipedia article title, used for images and links. */
  wiki?: string;
  /** Weekdays the attraction is closed (0 = Sunday ... 6 = Saturday). */
  closedDays?: number[];
  /** Months (1-12) in which the attraction is open or worthwhile. */
  months?: number[];
  tips?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  area: string;
  base: string;
  lat: number;
  lon: number;
  cuisine: string;
  specialties: string[];
  priceTier: TravelStyle;
  costForTwoInr: number;
  rating: number;
  openingHours: string;
  familyFriendly: boolean;
  /** Snack/street-food spots are not used for sit-down dinners. */
  snackOnly?: boolean;
}

export interface CatalogHotel {
  id: string;
  name: string;
  type: "hotel" | "resort" | "hostel" | "homestay";
  tier: TravelStyle;
  base: string;
  area: string;
  lat: number;
  lon: number;
  /** Indicative starting price per room (per bed for hostels) per night. */
  pricePerNightInr: number;
  rating: number;
  amenities: string[];
  description: string;
}

export type Level = "low" | "moderate" | "high" | "very high";

export interface SeasonPeriod {
  name: string;
  months: number[];
  tempC: [number, number];
  rainfall: Level;
  crowds: Level;
  notes: string;
}

export interface SeasonInfo {
  bestMonths: number[];
  summary: string;
  periods: SeasonPeriod[];
  festivals: Array<{ name: string; months: number[]; description: string }>;
  seasonalActivities: Array<{ months: number[]; activity: string }>;
  considerations: string[];
}

export interface Destination {
  key: string;
  name: string;
  state: string;
  aliases: string[];
  emoji: string;
  tagline: string;
  description: string;
  wiki: string;
  center: { lat: number; lon: number };
  gatewayBase: string;
  bases: Base[];
  highlights: string[];
  interests: Interest[];
  season: SeasonInfo;
  mustTryDishes: Array<{ name: string; description: string }>;
  attractions: Attraction[];
  restaurants: Restaurant[];
  hotels: CatalogHotel[];
}
