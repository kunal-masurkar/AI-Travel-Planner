import { z } from "zod";

export const travelPaceSchema = z.enum(["relaxed", "balanced", "packed"]);

export const activityCategorySchema = z.enum([
  "sightseeing",
  "food",
  "culture",
  "nature",
  "shopping",
  "evening",
  "transit",
]);

export const tripWeatherSchema = z.object({
  condition: z.string(),
  tempHighC: z.number(),
  tempLowC: z.number(),
});

export const tripLocationSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
});

export const tripActivitySchema = z.object({
  time: z.string(),
  title: z.string(),
  category: activityCategorySchema,
  estCostUsd: z.number().nonnegative(),
  notes: z.string().optional(),
  location: tripLocationSchema.optional(),
});

export const tripDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  date: z.string(),
  theme: z.string(),
  weather: tripWeatherSchema,
  activities: z.array(tripActivitySchema),
});

export const generateTripRequestSchema = z.object({
  destination: z.string().min(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budgetUsd: z.number().positive(),
  interests: z.array(z.string().min(1)).min(1),
  pace: travelPaceSchema,
  travelers: z.number().int().positive().default(1),
  notes: z.string().optional(),
});

export const itinerarySchema = z.object({
  tripId: z.string(),
  tripTitle: z.string(),
  destination: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  budgetEstimateUsd: z.number().nonnegative(),
  generatedAt: z.string(),
  summary: z.string(),
  days: z.array(tripDaySchema),
});

export const generateTripResponseSchema = z.object({
  itinerary: itinerarySchema,
  source: z.literal("local-demo"),
});

export type TravelPace = z.infer<typeof travelPaceSchema>;
export type ActivityCategory = z.infer<typeof activityCategorySchema>;
export type TravelPreferences = z.infer<typeof generateTripRequestSchema>;
export type TripWeather = z.infer<typeof tripWeatherSchema>;
export type TripLocation = z.infer<typeof tripLocationSchema>;
export type TripActivity = z.infer<typeof tripActivitySchema>;
export type TripDay = z.infer<typeof tripDaySchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
export type GenerateTripResponse = z.infer<typeof generateTripResponseSchema>;
