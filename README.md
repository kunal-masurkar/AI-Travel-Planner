# AI Travel Planner

AI Travel Planner is a showcase project built as a small monorepo with a React frontend, an Express API, and shared Zod schemas for itinerary data.

## Structure

- [apps/web](apps/web) - Vite + React UI
- [apps/api](apps/api) - Node.js + Express API
- [packages/shared](packages/shared) - shared itinerary schemas and types

## Getting started

1. Copy [`.env.example`](.env.example) to [`.env`](.env) and fill in the keys you want to use.
2. Install dependencies from the repo root with `npm install`.
3. Start both apps with `npm run dev`.
4. Build the workspace with `npm run build`.

## How to run

This project runs with Node.js and npm.

### Requirements

- Node.js 20 or newer
- npm 10 or newer

### Setup

1. Install dependencies:

	```bash
	npm install
	```

2. Create your environment file:

	```bash
	copy .env.example .env
	```

	Then fill in the values in [`.env`](.env).

3. Start the development servers:

	```bash
	npm run dev
	```

4. Open the apps:

	- Frontend: `http://localhost:5173`
	- API health: `http://localhost:8787/health`

### Other commands

- `npm run build` - build both the API and frontend
- `npm run typecheck` - run TypeScript checks across the workspace
- `npm run clean` - remove generated build output where supported

## Environment

The current scaffold expects these variables in [`.env`](.env):

- `PORT` - API port, default `8787`
- `VITE_API_BASE_URL` - frontend API base URL
- `GEMINI_API_KEY` - reserved for the AI layer
- `GEOAPIFY_API_KEY` - used for places and routing
- `PLACES_PROVIDER` - currently `geoapify`
- `ROUTING_PROVIDER` - currently `geoapify`
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key

## Status

The project currently includes a working demo itinerary generator, a polished landing page, and the API contract needed for future integrations with live place and weather services.

## Current provider choice

- Places and routing: Geoapify
- Geocoding: Nominatim by default, or Geoapify later if you want a single provider
- Weather: Open-Meteo
- LLM: Gemini

## Runtime env checks

The API validates its startup environment and prints warnings for missing keys like `GEOAPIFY_API_KEY`, `GEMINI_API_KEY`, and the Supabase settings. The `/health` endpoint also returns a safe summary of the env status.

## API endpoints

- `GET /health` - returns API status, selected providers, and environment warnings
- `POST /api/itineraries/generate` - returns a demo itinerary based on the submitted trip brief

## Notes

- OpenTripMap and OpenRouteService are no longer used in this scaffold.
- Geoapify is the preferred provider for both places and routing in this repo.
- The current generator is a demo implementation that is ready to be replaced with live AI and API orchestration.



