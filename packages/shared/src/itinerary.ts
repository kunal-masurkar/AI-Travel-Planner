import { z } from "zod";

export const travelPaceSchema = z.enum(["relaxed", "balanced", "packed"]);

export const travelStyleSchema = z.enum(["budget", "mid", "premium"]);

export const accommodationTypeSchema = z.enum(["any", "hotel", "resort", "hostel", "homestay"]);

export const interestSchema = z.enum([
  "adventure",
  "beaches",
  "nature",
  "history",
  "culture",
  "shopping",
  "food",
  "relaxation",
  "spiritual",
  "nightlife",
]);

export const activityCategorySchema = z.enum([
  "sightseeing",
  "food",
  "culture",
  "nature",
  "shopping",
  "evening",
  "transit",
  "adventure",
  "relaxation",
]);

export const activityKindSchema = z.enum(["attraction", "meal", "leisure", "transfer"]);

export const bestTimeSchema = z.enum(["sunrise", "morning", "afternoon", "sunset", "evening", "any"]);

export const tripWeatherSchema = z.object({
  condition: z.string(),
  tempHighC: z.number(),
  tempLowC: z.number(),
  source: z.enum(["forecast", "seasonal"]).default("seasonal"),
});

export const tripLocationSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  address: z.string().optional(),
});

export const travelLegSchema = z.object({
  distanceKm: z.number().nonnegative(),
  durationMin: z.number().nonnegative(),
  mode: z.enum(["walk", "auto", "car", "boat"]),
});

export const tripActivitySchema = z.object({
  time: z.string(),
  endTime: z.string().optional(),
  title: z.string(),
  category: activityCategorySchema,
  kind: activityKindSchema.default("attraction"),
  /** Estimated cost for the whole group, in INR. */
  estCostInr: z.number().nonnegative(),
  notes: z.string().optional(),
  location: tripLocationSchema.optional(),
  placeId: z.string().optional(),
  durationMin: z.number().nonnegative().optional(),
  /** Per-person entry ticket. */
  entryFeeInr: z.number().nonnegative().optional(),
  /** Per-person experience cost (boat ride, show, safari...). */
  activityFeeInr: z.number().nonnegative().optional(),
  costForTwoInr: z.number().nonnegative().optional(),
  openingHours: z.string().optional(),
  bestTime: bestTimeSchema.optional(),
  rating: z.number().optional(),
  priceTier: travelStyleSchema.optional(),
  specialties: z.array(z.string()).optional(),
  includesMeal: z.enum(["lunch", "dinner"]).optional(),
  indoor: z.boolean().optional(),
  wiki: z.string().optional(),
  /** Heads-up such as a weekly closure on the scheduled date. */
  warning: z.string().optional(),
  travelFromPrev: travelLegSchema.optional(),
});

export const alternativeSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  category: activityCategorySchema,
  reason: z.string(),
  distanceKm: z.number().nonnegative(),
});

export const tripDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  date: z.string(),
  theme: z.string(),
  baseKey: z.string().optional(),
  baseName: z.string().optional(),
  weather: tripWeatherSchema,
  activities: z.array(tripActivitySchema),
  alternatives: z.array(alternativeSchema).default([]),
  travelKm: z.number().nonnegative().default(0),
  travelMin: z.number().nonnegative().default(0),
});

export const hotelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["hotel", "resort", "hostel", "homestay"]),
  tier: travelStyleSchema,
  pricePerNightInr: z.number().nonnegative(),
  rating: z.number().optional(),
  area: z.string(),
  lat: z.number(),
  lon: z.number(),
  amenities: z.array(z.string()).default([]),
  description: z.string().optional(),
  bookingUrl: z.string().optional(),
  priceIsEstimate: z.boolean().optional(),
});

export const staySchema = z.object({
  baseKey: z.string(),
  baseName: z.string(),
  nights: z.number().int().nonnegative(),
  checkIn: z.string(),
  hotel: hotelSchema.nullable(),
  options: z.array(hotelSchema).default([]),
});

export const costBreakdownSchema = z.object({
  accommodation: z.number().nonnegative(),
  food: z.number().nonnegative(),
  localTransport: z.number().nonnegative(),
  sightseeing: z.number().nonnegative(),
  activities: z.number().nonnegative(),
  misc: z.number().nonnegative(),
  total: z.number().nonnegative(),
  perPerson: z.number().nonnegative(),
  travelers: z.number().int().positive(),
  nights: z.number().int().nonnegative(),
  rooms: z.number().int().nonnegative(),
});

export const generateTripRequestSchema = z
  .object({
    destination: z.string().min(2),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    budgetInr: z.number().positive().optional(),
    interests: z.array(z.string().min(1)).min(1),
    pace: travelPaceSchema,
    travelers: z.number().int().positive().max(30).default(1),
    travelStyle: travelStyleSchema.default("mid"),
    accommodationType: accommodationTypeSchema.default("any"),
    notes: z.string().max(1000).optional(),
    excludePlaceIds: z.array(z.string()).max(200).default([]),
    includePlaceIds: z.array(z.string()).max(50).default([]),
    seed: z.number().int().nonnegative().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after start date.",
    path: ["endDate"],
  })
  .refine(
    (data) => (Date.parse(data.endDate) - Date.parse(data.startDate)) / 86_400_000 < 14,
    { message: "Trips can be at most 14 days long.", path: ["endDate"] },
  );

export const itinerarySchema = z.object({
  tripId: z.string(),
  tripTitle: z.string(),
  destination: z.string(),
  destinationKey: z.string().nullable().default(null),
  startDate: z.string(),
  endDate: z.string(),
  /** Estimated total trip cost for the whole group (same as costBreakdown.total). */
  budgetEstimateInr: z.number().nonnegative(),
  /** The budget the traveller entered, if any. */
  budgetInr: z.number().nonnegative().optional(),
  generatedAt: z.string(),
  summary: z.string(),
  travelers: z.number().int().positive().default(1),
  travelStyle: travelStyleSchema.default("mid"),
  accommodationType: accommodationTypeSchema.default("any"),
  pace: travelPaceSchema.default("balanced"),
  interests: z.array(z.string()).default([]),
  seed: z.number().int().nonnegative().default(0),
  dataQuality: z.enum(["curated", "live", "generic"]).default("generic"),
  center: tripLocationSchema.optional(),
  seasonNote: z.string().optional(),
  mustTryDishes: z.array(z.string()).default([]),
  stays: z.array(staySchema).default([]),
  costBreakdown: costBreakdownSchema.optional(),
  days: z.array(tripDaySchema),
  aiTips: z.array(z.string()).optional(),
  notesAdvice: z.string().optional(),
});

export const generateTripResponseSchema = z.object({
  itinerary: itinerarySchema,
  source: z.enum(["local-demo", "live-hybrid"]),
  savedTripId: z.string().optional(),
});

export const customizeOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("remove"), dayNumber: z.number().int().positive(), index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("move"),
    dayNumber: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.object({ type: z.literal("add"), dayNumber: z.number().int().positive(), placeId: z.string() }),
  z.object({ type: z.literal("swapMeal"), dayNumber: z.number().int().positive(), index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("moveDay"),
    fromDayNumber: z.number().int().positive(),
    toDayNumber: z.number().int().positive(),
    index: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("setHotel"), baseKey: z.string(), hotelId: z.string() }),
  z.object({ type: z.literal("setTravelers"), travelers: z.number().int().positive().max(30) }),
  z.object({ type: z.literal("setStartDate"), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

export const customizeRequestSchema = z.object({
  itinerary: itinerarySchema,
  operation: customizeOperationSchema,
});

export type TravelPace = z.infer<typeof travelPaceSchema>;
export type TravelStyle = z.infer<typeof travelStyleSchema>;
export type AccommodationType = z.infer<typeof accommodationTypeSchema>;
export type Interest = z.infer<typeof interestSchema>;
export type ActivityCategory = z.infer<typeof activityCategorySchema>;
export type ActivityKind = z.infer<typeof activityKindSchema>;
export type BestTime = z.infer<typeof bestTimeSchema>;
export type TravelPreferences = z.infer<typeof generateTripRequestSchema>;
export type TripWeather = z.infer<typeof tripWeatherSchema>;
export type TripLocation = z.infer<typeof tripLocationSchema>;
export type TravelLeg = z.infer<typeof travelLegSchema>;
export type TripActivity = z.infer<typeof tripActivitySchema>;
export type TripAlternative = z.infer<typeof alternativeSchema>;
export type TripDay = z.infer<typeof tripDaySchema>;
export type Hotel = z.infer<typeof hotelSchema>;
export type Stay = z.infer<typeof staySchema>;
export type CostBreakdown = z.infer<typeof costBreakdownSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
export type GenerateTripResponse = z.infer<typeof generateTripResponseSchema>;
export type CustomizeOperation = z.infer<typeof customizeOperationSchema>;
