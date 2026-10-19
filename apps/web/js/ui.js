// Shared UI helpers: escaping, formatting, toasts, images and map links.

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const rupeeFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function inr(value) {
  return `₹${rupeeFormatter.format(Math.round(Number(value) || 0))}`;
}

export const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso, options = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { ...options, timeZone: "UTC" });
}

export function formatDateRange(start, end) {
  if (start === end) return formatDate(start);
  return `${formatDate(start, { day: "numeric", month: "short" })} – ${formatDate(end)}`;
}

export function weekday(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
}

export function addDays(iso, offset) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function todayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

export function minutesLabel(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export const styleLabels = { budget: "Budget", mid: "Mid-range", premium: "Premium" };

export const bestTimeLabels = {
  sunrise: "Sunrise",
  morning: "Morning",
  afternoon: "Afternoon",
  sunset: "Sunset",
  evening: "Evening",
  any: "Any time",
};

export const categoryIcons = {
  sightseeing: "🏛️",
  culture: "🎭",
  nature: "🌿",
  food: "🍽️",
  shopping: "🛍️",
  evening: "🌙",
  transit: "🚗",
  adventure: "🧗",
  relaxation: "🧘",
};

export const attractionTypeLabels = {
  landmark: "Landmark",
  historical: "Historical",
  nature: "Nature",
  adventure: "Adventure",
  "hidden-gem": "Hidden gem",
  beach: "Beach",
  culture: "Culture",
  spiritual: "Spiritual",
  shopping: "Shopping",
  museum: "Museum",
};

export const legModeIcons = { walk: "🚶", auto: "🛺", car: "🚗", boat: "⛴️" };

export function mapsSearchUrl(lat, lon, name = "") {
  const query = name ? `${name} @${lat},${lon}` : `${lat},${lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsDirectionsUrl(points) {
  const valid = points.filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
  if (valid.length === 0) return null;
  if (valid.length === 1) return mapsSearchUrl(valid[0].lat, valid[0].lon, valid[0].name);
  const format = (point) => `${point.lat},${point.lon}`;
  const origin = valid[0];
  const destination = valid[valid.length - 1];
  // Google Maps supports up to 9 waypoints in a URL.
  const waypoints = valid.slice(1, -1).slice(0, 9).map(format).join("|");
  const params = new URLSearchParams({ api: "1", origin: format(origin), destination: format(destination), travelmode: "driving" });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// --- Toasts ---------------------------------------------------------------

export function toast(message, kind = "info") {
  const host = document.getElementById("toast-host");
  if (!host) return;
  const element = document.createElement("div");
  element.className = `toast toast-${kind}`;
  element.setAttribute("role", kind === "error" ? "alert" : "status");
  element.textContent = message;
  host.appendChild(element);
  setTimeout(() => element.classList.add("leaving"), 3600);
  setTimeout(() => element.remove(), 4000);
}

// --- Loader ---------------------------------------------------------------

export function showLoader(title, steps) {
  const overlay = document.getElementById("loader-overlay");
  const titleEl = document.getElementById("loader-title");
  const textEl = document.getElementById("loader-step-text");
  const fill = document.getElementById("loader-progress-fill");
  overlay.hidden = false;
  titleEl.textContent = title;
  let index = 0;
  fill.style.width = "8%";
  textEl.textContent = steps[0] ?? "";
  const timer = setInterval(() => {
    index = Math.min(index + 1, steps.length - 1);
    textEl.textContent = steps[index];
    fill.style.width = `${Math.min(92, 8 + ((index + 1) / steps.length) * 84)}%`;
  }, 650);
  return () => {
    clearInterval(timer);
    fill.style.width = "100%";
    setTimeout(() => {
      overlay.hidden = true;
    }, 180);
  };
}

// --- Wikipedia images -----------------------------------------------------

const imageCache = new Map();

function readImageCache(title) {
  try {
    const value = localStorage.getItem(`wikiimg:${title}`);
    return value === null ? undefined : value;
  } catch {
    return undefined;
  }
}

function writeImageCache(title, url) {
  try {
    localStorage.setItem(`wikiimg:${title}`, url);
  } catch {
    /* storage unavailable */
  }
}

/** Wikipedia thumbnails are served at any width by rewriting the "/NNNpx-" segment. */
function resizeThumbnail(url, width) {
  return width && /\/\d+px-/.test(url) ? url.replace(/\/\d+px-/, `/${width}px-`) : url;
}

export async function wikiImage(title, width = 0) {
  if (!title) return "";
  if (width) return resizeThumbnail(await wikiImage(title), width);
  if (imageCache.has(title)) return imageCache.get(title);
  const cached = readImageCache(title);
  if (cached !== undefined) {
    imageCache.set(title, Promise.resolve(cached));
    return cached;
  }
  const request = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const url = data?.thumbnail?.source ?? "";
      writeImageCache(title, url);
      return url;
    })
    .catch(() => "");
  imageCache.set(title, request);
  return request;
}

/** Fill every `[data-wiki]` element inside `root` with its Wikipedia thumbnail. */
export function hydrateImages(root = document) {
  root.querySelectorAll("[data-wiki]:not([data-wiki-done])").forEach(async (element) => {
    element.setAttribute("data-wiki-done", "");
    const url = await wikiImage(element.getAttribute("data-wiki"), Number(element.getAttribute("data-wiki-width")) || 0);
    if (!url) return;
    const img = new Image();
    img.alt = element.getAttribute("data-alt") ?? "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => element.classList.add("has-image");
    img.src = url;
    element.prepend(img);
  });
}

export function wikiLink(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
