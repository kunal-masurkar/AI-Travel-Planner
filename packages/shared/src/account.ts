import { z } from "zod";
import { itinerarySchema } from "./itinerary.js";

export const signupRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const googleLoginRequestSchema = z.object({
  credential: z.string().min(20),
});

export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  provider: z.enum(["password", "google"]),
  createdAt: z.string(),
});

export const authResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
});

export const saveTripRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
  itinerary: itinerarySchema,
  preferences: z.record(z.unknown()).optional(),
});

export const updateTripRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
  itinerary: itinerarySchema.optional(),
  preferences: z.record(z.unknown()).optional(),
});

export const tripStatusSchema = z.enum(["upcoming", "ongoing", "past"]);

export const savedTripSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  destination: z.string(),
  destinationKey: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number().int().nonnegative(),
  travelers: z.number().int().positive(),
  totalCostInr: z.number().nonnegative(),
  status: tripStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const savedTripSchema = savedTripSummarySchema.extend({
  notes: z.string().default(""),
  itinerary: itinerarySchema,
  preferences: z.record(z.unknown()).default({}),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type SaveTripRequest = z.infer<typeof saveTripRequestSchema>;
export type UpdateTripRequest = z.infer<typeof updateTripRequestSchema>;
export type TripStatus = z.infer<typeof tripStatusSchema>;
export type SavedTripSummary = z.infer<typeof savedTripSummarySchema>;
export type SavedTrip = z.infer<typeof savedTripSchema>;
