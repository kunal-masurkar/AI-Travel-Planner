// Leaflet helpers. Leaflet is loaded as a global (window.L) from the CDN in index.html.

import { escapeHtml, mapsSearchUrl } from "./ui.js";

export const dayColors = ["#f59e0b", "#10b981", "#6366f1", "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#a855f7", "#ef4444", "#14b8a6", "#eab308", "#3b82f6", "#d946ef", "#22c55e"];

const kindColors = { attraction: "#f59e0b", restaurant: "#ec4899", hotel: "#6366f1" };

function leaflet() {
  return window.L ?? null;
}

export function createMap(element, center = { lat: 22.5, lon: 79 }, zoom = 5) {
  const L = leaflet();
  if (!L || !element) {
    if (element) element.innerHTML = `<div class="map-fallback">Map unavailable — check your connection.</div>`;
    return null;
  }
  const map = L.map(element, { scrollWheelZoom: false, zoomControl: true }).setView([center.lat, center.lon], zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  // Leaflet measures its container on creation; re-measure once layout settles.
  setTimeout(() => {
    if (map._mapPane) map.invalidateSize({ animate: false });
  }, 120);
  return map;
}

/** Remove a map safely, even if it is mid-animation. */
export function destroyMap(map) {
  if (!map?._mapPane) return;
  map.stop();
  map.remove();
}

function pinIcon(label, color) {
  const L = leaflet();
  return L.divIcon({
    className: "map-pin",
    html: `<span style="--pin:${color}">${escapeHtml(label)}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function popupHtml(title, subtitle, lat, lon) {
  return `<div class="map-popup"><strong>${escapeHtml(title)}</strong>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}<a href="${mapsSearchUrl(lat, lon, title)}" target="_blank" rel="noopener">Open in Google Maps ↗</a></div>`;
}

/** Plot an itinerary: numbered stops per day, a route line per day and hotel markers. */
export function renderItineraryMap(map, itinerary, dayFilter = "all") {
  const L = leaflet();
  if (!map || !L) return;
  map.__layers?.forEach((layer) => layer.remove());
  map.__layers = [];
  const bounds = [];

  for (const stay of itinerary.stays ?? []) {
    if (!stay.hotel) continue;
    const marker = L.marker([stay.hotel.lat, stay.hotel.lon], { icon: pinIcon("🏨", kindColors.hotel) })
      .bindPopup(popupHtml(stay.hotel.name, `Your stay in ${stay.baseName}`, stay.hotel.lat, stay.hotel.lon))
      .addTo(map);
    map.__layers.push(marker);
    if (dayFilter === "all" || itinerary.days.some((day) => String(day.dayNumber) === dayFilter && day.baseKey === stay.baseKey)) {
      bounds.push([stay.hotel.lat, stay.hotel.lon]);
    }
  }

  itinerary.days.forEach((day, dayIndex) => {
    if (dayFilter !== "all" && String(day.dayNumber) !== dayFilter) return;
    const color = dayColors[dayIndex % dayColors.length];
    const stay = itinerary.stays?.find((entry) => entry.baseKey === day.baseKey);
    const path = stay?.hotel ? [[stay.hotel.lat, stay.hotel.lon]] : [];
    let stopNumber = 0;

    for (const activity of day.activities) {
      if (!activity.location || activity.kind === "transfer") continue;
      const point = [activity.location.lat, activity.location.lon];
      path.push(point);
      bounds.push(point);
      const label = activity.kind === "meal" ? "🍽" : String(++stopNumber);
      const marker = L.marker(point, { icon: pinIcon(label, activity.kind === "meal" ? kindColors.restaurant : color) })
        .bindPopup(popupHtml(activity.title, `Day ${day.dayNumber} · ${activity.time}`, point[0], point[1]))
        .addTo(map);
      map.__layers.push(marker);
    }

    if (path.length > 1) {
      const line = L.polyline(path, { color, weight: 4, opacity: 0.85, dashArray: dayFilter === "all" ? "6 8" : null }).addTo(map);
      map.__layers.push(line);
    }
  });

  if (bounds.length > 0) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14, animate: false });
}

/** Plot a destination's places, with one toggleable layer per kind. */
export function renderPlacesMap(map, destination) {
  const L = leaflet();
  if (!map || !L) return;
  const groups = {
    "🏛️ Attractions": destination.attractions.map((place) =>
      L.marker([place.lat, place.lon], { icon: pinIcon("●", kindColors.attraction) }).bindPopup(popupHtml(place.name, place.area, place.lat, place.lon)),
    ),
    "🍽️ Restaurants": destination.restaurants.map((place) =>
      L.marker([place.lat, place.lon], { icon: pinIcon("●", kindColors.restaurant) }).bindPopup(popupHtml(place.name, place.cuisine, place.lat, place.lon)),
    ),
    "🏨 Hotels": destination.hotels.map((place) =>
      L.marker([place.lat, place.lon], { icon: pinIcon("●", kindColors.hotel) }).bindPopup(popupHtml(place.name, place.area, place.lat, place.lon)),
    ),
  };
  const layers = Object.fromEntries(Object.entries(groups).map(([name, markers]) => [name, L.layerGroup(markers).addTo(map)]));
  L.control.layers(null, layers, { collapsed: false }).addTo(map);
  const all = Object.values(groups).flat().map((marker) => marker.getLatLng());
  if (all.length > 0) map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 13, animate: false });
}

export function focusOn(map, lat, lon, zoom = 15) {
  if (!map) return;
  map.setView([lat, lon], zoom);
}
