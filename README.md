# India Travel Planner

India Travel Planner is a small monorepo for planning trips across India. It includes a static frontend, an Express API, and shared Zod schemas for itinerary data.

## Structure

- [apps/web](apps/web) - static HTML/CSS/JS UI (India-only destinations, INR budgets)
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

4. Open the app:

	- Frontend: `http://localhost:5173`
	- API health: `http://localhost:8787/health` (also proxied at `http://localhost:5173/health`)

### Other commands

- `npm run build` - build the shared package and API
- `npm run start` - run the built API and web server (after `npm run build`)
- `npm run typecheck` - run TypeScript checks across the workspace
- `npm run clean` - remove generated build output where supported

## Environment

The API reads these variables from [`.env`](.env):

- `PORT` - API port, default `8787`
- `WEB_PORT` - frontend port, default `5173`
- `GEMINI_API_KEY` - reserved for the AI layer
- `GEOAPIFY_API_KEY` - used for places and routing
- `PLACES_PROVIDER` - currently `geoapify`
- `ROUTING_PROVIDER` - currently `geoapify`
- `GEOCODING_PROVIDER` - `nominatim` by default
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key

## Status

The project includes a working demo itinerary generator for Indian destinations, a polished landing page, and the API contract needed for future integrations with live place and weather services.

## Planned provider integrations

- Places and routing: Geoapify
- Geocoding: Nominatim by default, or Geoapify later
- Weather: Open-Meteo
- LLM: Gemini

## What I need from you

- Trip destination in India
- Start date and end date
- Budget in INR
- Interests like food, beaches, forts, culture
- Pace: relaxed, balanced, or packed
- Travelers count
- Optional notes

## Live keys

- `GEOAPIFY_API_KEY` - needed for live place search and live route data
- `GEMINI_API_KEY` - needed only when AI planning is added
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` - needed only when saving trips
- `GEOCODING_PROVIDER=nominatim` - no key needed
- `OPEN-METEO` - no key needed

## Runtime env checks

The API validates its startup environment and prints warnings for missing keys like `GEOAPIFY_API_KEY`, `GEMINI_API_KEY`, and the Supabase settings. The `/health` endpoint also returns a safe summary of the env status.

## API endpoints

- `GET /health` - returns API status, selected providers, and environment warnings
- `POST /api/itineraries/generate` - returns a demo itinerary based on the submitted trip brief

Trip brief fields use INR (`budgetInr`) and are validated on both client and server.

## Notes

- The UI is India-focused: destinations, copy, and currency are tuned for Indian travel.
- The dev web server proxies `/api` and `/health` to the API so the frontend can use same-origin requests.
- The current generator is a demo implementation that is ready to be replaced with live AI and API orchestration.
