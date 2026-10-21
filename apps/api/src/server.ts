import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { getProviderConfig } from "./config/providers.js";
import { validateRuntimeEnv } from "./config/runtimeEnv.js";
import { authRouter } from "./routes/auth.js";
import { destinationsRouter } from "./routes/destinations.js";
import { itinerariesRouter } from "./routes/itineraries.js";
import { tripsRouter } from "./routes/trips.js";
import { db } from "./store/db.js";

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

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_request, response) => {
  response.json({
    ok: runtimeEnv.ok,
    service: "api",
    timestamp: new Date().toISOString(),
    providers: getProviderConfig(),
    env: runtimeEnv,
  });
});

/** Public client configuration (no secrets). */
app.get("/api/config", (_request, response) => {
  response.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    livePlaces: getProviderConfig().geoapifyApiKeyConfigured,
  });
});

app.use("/api/auth", authRouter);
app.use("/api/destinations", destinationsRouter);
app.use("/api/itineraries", itinerariesRouter);
app.use("/api/trips", tripsRouter);

// Static web serving for unified single-port production (Render, Docker, etc.)
const candidateWebDirs = [
  resolve(process.cwd(), "apps/web"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web"),
];
const webDir = candidateWebDirs.find((dir) => existsSync(dir));

if (webDir) {
  app.use(express.static(webDir));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api") || request.path === "/health") {
      return next();
    }
    response.sendFile(resolve(webDir, "index.html"));
  });
}

app.use("/api", (_request, response) => {
  response.status(404).json({ message: "Not found." });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ message: "Something went wrong on our side. Please try again." });
});

async function start() {
  await db.init();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

void start();
