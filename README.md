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

## Features

- **Explore destinations** — curated guides for Goa, Jaipur, Kerala, Udaipur, Varanasi, Himachal (Shimla/Manali), Delhi, Mumbai and Agra: attractions (hours, entry fees, visit duration, best time of day, hidden gems), restaurants, hotels in three tiers, must-try dishes, month-by-month season guide, festivals and travel considerations, plus an interactive map.
- **Itineraries for any length** — 3/4/5/7-day comparisons (or 1–14 days) built day by day: places grouped geographically, realistic timings with travel legs, lunch/dinner near your route, hotels near your stops, multi-base routing for regions like Kerala and Himachal, weekly closures avoided, and nearby alternatives (indoor options on rainy days).
- **Cost estimates** — accommodation, food, local transport, entry tickets, activities and misc., per person and for the group, across budget / mid-range / premium styles, compared against your budget.
- **Customise** — remove, reorder or add stops, swap restaurants, change hotels, travellers, dates, duration, style or pace, or regenerate; costs and routes update instantly.
- **Accounts** — sign up / log in with email + password (scrypt-hashed), optional Google sign-in, logout. Signed-in plans are saved automatically; the dashboard lists upcoming and past trips with view, rename, notes, duplicate and delete.
- **Maps** — Leaflet + OpenStreetMap with per-day routes, and "open in Google Maps" directions for each day.
- Other Indian destinations work too: with `GEOAPIFY_API_KEY` set, places, restaurants and stays come from live data; otherwise a generic outline is produced.

## Environment

The API reads these variables from [`.env`](.env):

- `PORT` - API port, default `8787`
- `WEB_PORT` - frontend port, default `5173`
- `GEOAPIFY_API_KEY` - live places for destinations outside the curated catalog
- `GEOCODING_PROVIDER` - `nominatim` by default (no key needed)
- `GOOGLE_CLIENT_ID` - optional; enables "Continue with Google" (add your site origin, e.g. `http://localhost:5173`, to the OAuth client's authorised JavaScript origins)
- `DATA_DIR` - optional; folder for the JSON database of users, sessions and saved trips (default `apps/api/data`, git-ignored)
- `GEMINI_API_KEY` - reserved for a future AI layer

Weather comes from Open-Meteo (no key): live forecasts within ~2 weeks of travel, otherwise the same dates last year as a typical-weather guide, falling back to seasonal averages.

## API endpoints

- `GET /health` - API status, providers and environment warnings
- `GET /api/config` - public client config (Google client ID, live-places flag)
- `GET /api/destinations` / `GET /api/destinations/:key?travelers=&startDate=` - destination summaries and full guides with 3/4/5/7-day cost estimates per travel style
- `POST /api/itineraries/generate` - build an itinerary (auto-saved for signed-in users unless `?save=false`)
- `POST /api/itineraries/customize` - apply one edit (`remove`, `move`, `add`, `swapMeal`, `setHotel`, `setTravelers`, `setStartDate`) and get the recalculated itinerary
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/me/recent`
- `GET/POST /api/trips`, `GET/PUT/DELETE /api/trips/:id`, `POST /api/trips/:id/duplicate` - saved trips (Bearer token required)

Requests and responses are validated with the shared Zod schemas in [packages/shared](packages/shared).

## Notes

- Prices, ratings and opening hours in the catalog are indicative — confirm before booking.
- The dev web server proxies `/api` and `/health` to the API so the frontend can use same-origin requests.
- Accounts and trips are stored in a local JSON file, suitable for a single server. Swap [apps/api/src/store/db.ts](apps/api/src/store/db.ts) for a real database before deploying at scale.
