import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import {
  generateTripRequestSchema,
  generateTripResponseSchema,
} from "@ai-travel-planner/shared";
import { getProviderConfig } from "./config/providers.js";
import { validateRuntimeEnv } from "./config/runtimeEnv.js";
import { buildDemoItinerary } from "./services/buildDemoItinerary.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8787);
const runtimeEnv = validateRuntimeEnv();

if (runtimeEnv.warnings.length > 0) {
  console.warn("Runtime environment warnings:");
  for (const warning of runtimeEnv.warnings) {
    console.warn(`- ${warning}`);
  }
}

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: runtimeEnv.ok,
    service: "api",
    timestamp: new Date().toISOString(),
    providers: getProviderConfig(),
    env: runtimeEnv,
  });
});

app.post("/api/itineraries/generate", (request, response) => {
  const parsedRequest = generateTripRequestSchema.safeParse(request.body);

  if (!parsedRequest.success) {
    return response.status(400).json({
      message: "Invalid trip request",
      issues: parsedRequest.error.flatten(),
    });
  }

  const itinerary = buildDemoItinerary(parsedRequest.data);
  const payload = generateTripResponseSchema.parse({
    itinerary,
    source: "local-demo",
  });

  return response.json(payload);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
