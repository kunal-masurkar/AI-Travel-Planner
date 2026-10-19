// Itinerary view + editor. Used by the planner (fresh plans) and saved-trip pages.

import { api } from "../api.js";
import { createMap, dayColors, destroyMap, renderItineraryMap } from "../map.js";
import { saveDraft, state } from "../state.js";
import {
  addDays,
  bestTimeLabels,
  categoryIcons,
  escapeHtml,
  formatDate,
  formatDateRange,
  inr,
  legModeIcons,
  mapsDirectionsUrl,
  mapsSearchUrl,
  minutesLabel,
  showLoader,
  styleLabels,
  toast,
  weekday,
} from "../ui.js";
import { openAuthModal } from "./auth.js";

const costCategories = [
  ["accommodation", "🏨", "Accommodation"],
  ["food", "🍽️", "Food & restaurants"],
  ["localTransport", "🚗", "Local transport"],
  ["sightseeing", "🎟️", "Sightseeing & tickets"],
  ["activities", "🧗", "Activities & experiences"],
  ["misc", "🧾", "Miscellaneous"],
];

const qualityLabels = {
  curated: ["Curated guide", "Hand-picked places with hours, fees and coordinates."],
  live: ["Live places", "Places from OpenStreetMap/Geoapify — hours and prices are estimates."],
  generic: ["Suggested outline", "Generic ideas — add a GEOAPIFY_API_KEY for real places here."],
};

export function preferencesFromItinerary(itinerary, stored = {}) {
  return {
    destination: stored.destination ?? itinerary.destination,
    startDate: itinerary.startDate,
    endDate: itinerary.endDate,
    interests: itinerary.interests?.length ? itinerary.interests : stored.interests ?? ["culture"],
    pace: itinerary.pace ?? stored.pace ?? "balanced",
    travelers: itinerary.travelers ?? stored.travelers ?? 1,
    travelStyle: itinerary.travelStyle ?? stored.travelStyle ?? "mid",
    accommodationType: itinerary.accommodationType ?? stored.accommodationType ?? "any",
    ...(itinerary.budgetInr ? { budgetInr: itinerary.budgetInr } : stored.budgetInr ? { budgetInr: stored.budgetInr } : {}),
    ...(stored.notes ? { notes: stored.notes } : {}),
  };
}

function itineraryAsText(itinerary, title) {
  const lines = [`${title}`, `${itinerary.destination} · ${formatDateRange(itinerary.startDate, itinerary.endDate)} · ${itinerary.travelers} traveller(s)`, ""];
  for (const stay of itinerary.stays) {
    if (stay.hotel) lines.push(`Stay: ${stay.hotel.name}, ${stay.baseName} (${stay.nights} night${stay.nights === 1 ? "" : "s"}, ~${inr(stay.hotel.pricePerNightInr)}/night)`);
  }
  lines.push("");
  for (const day of itinerary.days) {
    lines.push(`DAY ${day.dayNumber} · ${weekday(day.date)} ${formatDate(day.date)} — ${day.theme}`);
    lines.push(`Weather: ${day.weather.condition}, ${day.weather.tempHighC}°/${day.weather.tempLowC}°C`);
    for (const activity of day.activities) {
      lines.push(`  ${activity.time}  ${activity.title}${activity.estCostInr ? ` (${inr(activity.estCostInr)})` : ""}`);
    }
    lines.push("");
  }
  const cost = itinerary.costBreakdown;
  if (cost) {
    lines.push(`Estimated total: ${inr(cost.total)} (${inr(cost.perPerson)} per person)`);
    for (const [key, , label] of costCategories) lines.push(`  ${label}: ${inr(cost[key])}`);
  }
  return lines.join("\n");
}

/**
 * Mount an itinerary into `host`.
 * options: { itinerary, savedTripId, title, notes, preferences }
 */
export function mountTrip(host, options) {
  const ctrl = {
    itinerary: options.itinerary,
    savedTripId: options.savedTripId ?? null,
    title: options.title ?? options.itinerary.tripTitle,
    notes: options.notes ?? "",
    preferences: options.preferences ?? preferencesFromItinerary(options.itinerary),
    activeDay: "all",
    openStay: null,
    busy: false,
    map: null,
    pickerOpen: false,
    pickerDay: null,
    pickerQuery: "",
    catalogPlaces: null,
    catalogLoading: false,
  };

  function persistDraft() {
    if (!ctrl.savedTripId) saveDraft({ itinerary: ctrl.itinerary, preferences: ctrl.preferences, title: ctrl.title });
  }

  async function persist(fields) {
    if (!ctrl.savedTripId) {
      persistDraft();
      return;
    }
    try {
      await api(`/api/trips/${ctrl.savedTripId}`, { method: "PUT", body: fields });
      flashSaved();
    } catch (error) {
      toast(`Couldn't save changes: ${error.message}`, "error");
    }
  }

  function flashSaved() {
    const status = host.querySelector("#save-status");
    if (!status) return;
    status.textContent = "✓ Saved";
    status.classList.add("flash");
    setTimeout(() => status.classList.remove("flash"), 1200);
  }

  async function applyOperation(operation, successMessage) {
    if (ctrl.busy) return;
    ctrl.busy = true;
    host.classList.add("is-busy");
    try {
      const { itinerary } = await api("/api/itineraries/customize", { method: "POST", body: { itinerary: ctrl.itinerary, operation } });
      ctrl.itinerary = itinerary;
      ctrl.preferences = preferencesFromItinerary(itinerary, ctrl.preferences);
      render();
      await persist({ itinerary });
      if (successMessage) toast(successMessage, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      ctrl.busy = false;
      host.classList.remove("is-busy");
    }
  }

  async function regenerate(changes = {}, message = "Fresh itinerary generated") {
    const preferences = { ...ctrl.preferences, ...changes, seed: changes.seed ?? ctrl.itinerary.seed ?? 0 };
    const hide = showLoader("Rebuilding your itinerary", ["Re-ranking places for you…", "Grouping nearby stops…", "Re-checking costs…"]);
    try {
      const result = await api("/api/itineraries/generate?save=false", { method: "POST", body: preferences });
      ctrl.itinerary = result.itinerary;
      ctrl.preferences = preferencesFromItinerary(result.itinerary, preferences);
      if (!ctrl.savedTripId || ctrl.title.match(/^\d+-Day /)) ctrl.title = result.itinerary.tripTitle;
      ctrl.activeDay = "all";
      render();
      await persist({ itinerary: result.itinerary, preferences: ctrl.preferences, title: ctrl.title });
      toast(message, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      hide();
    }
  }

  async function saveToAccount() {
    if (!state.user) {
      openAuthModal("login", "Log in or sign up to save this trip to your account.", () => saveToAccount());
      return;
    }
    try {
      const { trip } = await api("/api/trips", {
        method: "POST",
        body: { itinerary: ctrl.itinerary, title: ctrl.title, notes: ctrl.notes, preferences: ctrl.preferences },
      });
      ctrl.savedTripId = trip.id;
      toast("Trip saved to your account", "success");
      location.hash = `#/trip/${trip.id}`;
    } catch (error) {
      toast(error.message, "error");
    }
  }

  // ---- Rendering -----------------------------------------------------------

  function headerHtml() {
    const itinerary = ctrl.itinerary;
    const [qualityLabel, qualityHint] = qualityLabels[itinerary.dataQuality] ?? qualityLabels.generic;
    const saveState = ctrl.savedTripId
      ? `<span class="save-status" id="save-status">✓ Saved to your trips</span>`
      : state.user
        ? `<button type="button" class="btn-action primary" data-action="save">💾 Save to my trips</button>`
        : `<button type="button" class="btn-action primary" data-action="save">🔐 Log in to save</button>`;

    return `
      <div class="trip-header">
        <div class="trip-title-block">
          ${
            ctrl.savedTripId
              ? `<label class="sr-only" for="trip-title-input">Trip name</label><input class="trip-title-input" id="trip-title-input" value="${escapeHtml(ctrl.title)}" maxlength="120" />`
              : `<h2 class="trip-title">${escapeHtml(ctrl.title)}</h2>`
          }
          <p class="trip-meta">
            📍 ${escapeHtml(itinerary.destination)} · 🗓️ ${escapeHtml(formatDateRange(itinerary.startDate, itinerary.endDate))} · ${itinerary.days.length} days · 👤 ${itinerary.travelers} · ${styleLabels[itinerary.travelStyle]} · ${escapeHtml(itinerary.pace)} pace
          </p>
          <p class="trip-summary">${escapeHtml(itinerary.summary)} <span class="quality-badge quality-${itinerary.dataQuality}" title="${escapeHtml(qualityHint)}">${escapeHtml(qualityLabel)}</span></p>
        </div>
        <div class="trip-actions">
          ${saveState}
          <button type="button" class="btn-action" data-action="regenerate" title="Generate a different mix of places">🔀 Regenerate</button>
          ${ctrl.savedTripId ? `<button type="button" class="btn-action" data-action="duplicate">⧉ Duplicate</button>` : ""}
          <button type="button" class="btn-action" data-action="copy">📋 Copy</button>
          <button type="button" class="btn-action" data-action="print">🖨️ Print</button>
          ${ctrl.savedTripId ? `<button type="button" class="btn-action danger" data-action="delete">🗑️ Delete</button>` : ""}
        </div>
      </div>

      <div class="trip-settings" aria-label="Trip settings">
        <label>Start date<input type="date" id="set-start" value="${itinerary.startDate}" /></label>
        <label>Duration
          <select id="set-days">${Array.from({ length: 14 }, (_unused, index) => index + 1)
            .map((days) => `<option value="${days}" ${days === itinerary.days.length ? "selected" : ""}>${days} day${days === 1 ? "" : "s"}</option>`)
            .join("")}</select>
        </label>
        <label>Travellers
          <select id="set-travelers">${Array.from({ length: 20 }, (_unused, index) => index + 1)
            .map((count) => `<option value="${count}" ${count === itinerary.travelers ? "selected" : ""}>${count}</option>`)
            .join("")}</select>
        </label>
        <label>Travel style
          <select id="set-style">${["budget", "mid", "premium"].map((style) => `<option value="${style}" ${style === itinerary.travelStyle ? "selected" : ""}>${styleLabels[style]}</option>`).join("")}</select>
        </label>
        <label>Pace
          <select id="set-pace">${["relaxed", "balanced", "packed"].map((pace) => `<option value="${pace}" ${pace === itinerary.pace ? "selected" : ""}>${pace[0].toUpperCase() + pace.slice(1)}</option>`).join("")}</select>
        </label>
      </div>

      ${itinerary.seasonNote ? `<div class="notice">🌤️ ${escapeHtml(itinerary.seasonNote)}</div>` : ""}
      ${itinerary.notesAdvice ? `<div class="notice" style="background: rgba(37, 99, 235, 0.08); border-color: rgba(37, 99, 235, 0.25);">💡 <strong>Personalized:</strong> ${escapeHtml(itinerary.notesAdvice)}</div>` : ""}
      ${
        Array.isArray(itinerary.aiTips) && itinerary.aiTips.length > 0
          ? `<div class="card-panel compact-panel ai-tips-panel" style="margin-top: 0.75rem; border-left: 3px solid #2563eb; background: #f8fafc;">
              <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 600; color: #1e293b;">✨ Local Insider Tips</h4>
              <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.85rem; color: #475569; line-height: 1.5;">
                ${itinerary.aiTips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}
              </ul>
            </div>`
          : ""
      }
    `;
  }

  function costHtml() {
    const itinerary = ctrl.itinerary;
    const cost = itinerary.costBreakdown;
    if (!cost) return "";
    const budget = itinerary.budgetInr;
    const diff = budget ? budget - cost.total : null;
    return `
      <section class="card-panel compact-panel">
        <h3 class="panel-title">💰 Estimated cost</h3>
        <div class="cost-total">
          <strong>${inr(cost.total)}</strong>
          <span>${inr(cost.perPerson)} per person · ${cost.travelers} traveller${cost.travelers === 1 ? "" : "s"} · ${cost.nights} night${cost.nights === 1 ? "" : "s"}${cost.rooms ? ` · ${cost.rooms} room${cost.rooms === 1 ? "" : "s"}` : ""}</span>
        </div>
        ${
          diff !== null
            ? `<div class="budget-compare ${diff >= 0 ? "under" : "over"}">${
                diff >= 0 ? `✓ ${inr(diff)} under your ${inr(budget)} budget` : `⚠ ${inr(-diff)} over your ${inr(budget)} budget — try the budget style or fewer paid activities`
              }</div>`
            : ""
        }
        <div class="breakdown-bars">
          ${costCategories
            .map(([key, icon, label]) => {
              const share = cost.total ? (cost[key] / cost.total) * 100 : 0;
              return `<div class="breakdown-row"><span>${icon} ${label}</span><div class="bar"><span style="width:${share.toFixed(1)}%"></span></div><strong>${inr(cost[key])}</strong></div>`;
            })
            .join("")}
        </div>
        <p class="muted small">Excludes flights/trains to ${escapeHtml(itinerary.destination)}. Prices are indicative.</p>
      </section>`;
  }

  function hotelBlock(hotel, { selectable = false, baseKey = "", selected = false } = {}) {
    if (!hotel) return "";
    return `
      <div class="hotel-card ${selected ? "selected" : ""}">
        <div class="hotel-head">
          <strong>${escapeHtml(hotel.name)}</strong>
          ${hotel.rating ? `<span class="rating">★ ${hotel.rating.toFixed(1)}</span>` : ""}
        </div>
        <span class="muted small">${escapeHtml(hotel.type)} · ${styleLabels[hotel.tier]} · 📍 ${escapeHtml(hotel.area)}</span>
        <span class="hotel-price">${hotel.priceIsEstimate ? "≈ " : "from "}${inr(hotel.pricePerNightInr)}<small>/${hotel.type === "hostel" ? "bed" : "room"} night</small></span>
        ${hotel.amenities?.length ? `<div class="tag-row">${hotel.amenities.slice(0, 4).map((amenity) => `<span class="tag">${escapeHtml(amenity)}</span>`).join("")}</div>` : ""}
        <div class="card-links">
          ${hotel.bookingUrl ? `<a href="${escapeHtml(hotel.bookingUrl)}" target="_blank" rel="noopener">Booking.com ↗</a>` : ""}
          <a href="${mapsSearchUrl(hotel.lat, hotel.lon, hotel.name)}" target="_blank" rel="noopener">Map ↗</a>
          ${selectable && !selected ? `<button type="button" class="link-button" data-op="hotel" data-base="${escapeHtml(baseKey)}" data-hotel="${escapeHtml(hotel.id)}">Choose this</button>` : ""}
        </div>
      </div>`;
  }

  function staysHtml() {
    const stays = ctrl.itinerary.stays ?? [];
    if (stays.length === 0) return "";
    return `
      <section class="card-panel compact-panel">
        <h3 class="panel-title">🏨 Where you'll stay</h3>
        ${stays
          .map((stay) => {
            const open = ctrl.openStay === stay.baseKey;
            const options = stay.options.filter((option) => option.id !== stay.hotel?.id);
            return `
              <div class="stay-block">
                <div class="stay-head">
                  <span><strong>${escapeHtml(stay.baseName)}</strong> · ${stay.nights} night${stay.nights === 1 ? "" : "s"} from ${escapeHtml(formatDate(stay.checkIn, { day: "numeric", month: "short" }))}</span>
                  ${options.length ? `<button type="button" class="link-button" data-toggle-stay="${escapeHtml(stay.baseKey)}">${open ? "Close" : "Change"}</button>` : ""}
                </div>
                ${stay.nights === 0 ? `<p class="muted small">Day trip — no overnight stay needed.</p>` : hotelBlock(stay.hotel, { selected: true })}
                ${
                  open
                    ? `<div class="hotel-options">${["budget", "mid", "premium"]
                        .map((tier) => {
                          const inTier = options.filter((option) => option.tier === tier);
                          return inTier.length
                            ? `<h4 class="tier-heading">${styleLabels[tier]}</h4>${inTier.map((option) => hotelBlock(option, { selectable: true, baseKey: stay.baseKey })).join("")}`
                            : "";
                        })
                        .join("")}</div>`
                    : ""
                }
              </div>`;
          })
          .join("")}
      </section>`;
  }

  function dishesHtml() {
    const dishes = ctrl.itinerary.mustTryDishes ?? [];
    if (dishes.length === 0) return "";
    return `
      <section class="card-panel compact-panel">
        <h3 class="panel-title">🍛 Must-try dishes</h3>
        <div class="chip-row">${dishes.map((dish) => `<span class="pill">${escapeHtml(dish)}</span>`).join("")}</div>
      </section>`;
  }

  function notesHtml() {
    if (!ctrl.savedTripId) return "";
    return `
      <section class="card-panel compact-panel">
        <h3 class="panel-title">📝 Trip notes</h3>
        <label class="sr-only" for="trip-notes">Trip notes</label>
        <textarea id="trip-notes" rows="4" maxlength="2000" placeholder="Booking references, packing list, ideas…">${escapeHtml(ctrl.notes)}</textarea>
      </section>`;
  }

  function activityHtml(activity, day, index, stopIndex, stopCount) {
    const leg = activity.travelFromPrev;
    const legHtml =
      leg && leg.durationMin > 0 && activity.kind !== "transfer"
        ? `<div class="leg">${legModeIcons[leg.mode] ?? "🚗"} ${minutesLabel(leg.durationMin)} · ${leg.distanceKm} km</div>`
        : "";

    const facts = [];
    if (activity.kind === "meal") {
      if (activity.rating) facts.push(`★ ${activity.rating.toFixed(1)}`);
      if (activity.costForTwoInr) facts.push(`${inr(activity.costForTwoInr)} for two`);
      if (activity.priceTier) facts.push(styleLabels[activity.priceTier]);
      if (activity.openingHours) facts.push(`🕘 ${activity.openingHours}`);
    } else if (activity.kind === "attraction") {
      if (activity.openingHours) facts.push(`🕘 ${activity.openingHours}`);
      facts.push(activity.entryFeeInr ? `🎟️ ${inr(activity.entryFeeInr)} pp` : "🎟️ Free entry");
      if (activity.activityFeeInr) facts.push(`🧗 ${inr(activity.activityFeeInr)} pp experience`);
      if (activity.durationMin) facts.push(`⏱️ ${minutesLabel(activity.durationMin)}`);
      if (activity.bestTime && activity.bestTime !== "any") facts.push(`Best: ${bestTimeLabels[activity.bestTime].toLowerCase()}`);
      if (activity.includesMeal) facts.push(`Includes ${activity.includesMeal}`);
    }

    const isStop = activity.kind === "attraction" || activity.kind === "leisure";
    const dayOptions = ctrl.itinerary.days.length > 1
      ? `<select class="day-mover-select" data-op="moveDay" data-from-day="${day.dayNumber}" data-index="${index}" title="Move stop to another day">
           <option value="" selected disabled>⇄ Day</option>
           ${ctrl.itinerary.days
             .filter((d) => d.dayNumber !== day.dayNumber)
             .map((d) => `<option value="${d.dayNumber}">Day ${d.dayNumber}</option>`)
             .join("")}
         </select>`
      : "";

    const controls = isStop
      ? `<button type="button" class="icon-btn" data-op="move" data-day="${day.dayNumber}" data-index="${index}" data-dir="-1" ${stopIndex === 0 ? "disabled" : ""} aria-label="Move earlier">↑</button>
         <button type="button" class="icon-btn" data-op="move" data-day="${day.dayNumber}" data-index="${index}" data-dir="1" ${stopIndex === stopCount - 1 ? "disabled" : ""} aria-label="Move later">↓</button>
         ${dayOptions}
         <button type="button" class="icon-btn" data-op="remove" data-day="${day.dayNumber}" data-index="${index}" aria-label="Remove ${escapeHtml(activity.title)}">✕</button>`
      : activity.kind === "meal" && ctrl.itinerary.destinationKey
        ? `<button type="button" class="icon-btn wide" data-op="swap" data-day="${day.dayNumber}" data-index="${index}" title="Suggest a different restaurant">🔄 Swap</button>`
        : "";

    return `
      <li class="activity-item kind-${activity.kind}">
        ${legHtml}
        <div class="activity-row">
          <div class="activity-time"><span>${escapeHtml(activity.time)}</span>${activity.endTime ? `<small>${escapeHtml(activity.endTime)}</small>` : ""}</div>
          <div class="activity-body">
            <div class="activity-title-row">
              <strong>${categoryIcons[activity.category] ?? "📍"} ${escapeHtml(activity.title)}</strong>
              <span class="activity-category-tag">${escapeHtml(activity.kind === "meal" ? "meal" : activity.category)}</span>
            </div>
            ${activity.notes ? `<p>${escapeHtml(activity.notes)}</p>` : ""}
            ${activity.specialties?.length ? `<p class="specialties">Try: ${escapeHtml(activity.specialties.join(", "))}</p>` : ""}
            ${facts.length ? `<div class="fact-inline">${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("")}</div>` : ""}
            ${activity.warning ? `<div class="activity-warning">⚠ ${escapeHtml(activity.warning)}</div>` : ""}
          </div>
          <div class="activity-side">
            <span class="activity-cost">${activity.estCostInr ? inr(activity.estCostInr) : "—"}</span>
            <div class="activity-controls">
              ${controls}
              ${activity.location ? `<a class="icon-btn" href="${mapsSearchUrl(activity.location.lat, activity.location.lon, activity.location.name)}" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(activity.title)} in Google Maps">↗</a>` : ""}
            </div>
          </div>
        </div>
      </li>`;
  }

  function dayHtml(day, dayIndex) {
    const stopIndexes = day.activities.map((activity, index) => (activity.kind === "attraction" || activity.kind === "leisure" ? index : -1)).filter((index) => index >= 0);
    const stay = ctrl.itinerary.stays.find((entry) => entry.baseKey === day.baseKey);
    const routePoints = [
      ...(stay?.hotel ? [{ lat: stay.hotel.lat, lon: stay.hotel.lon, name: stay.hotel.name }] : []),
      ...day.activities.filter((activity) => activity.location && activity.kind !== "transfer").map((activity) => activity.location),
    ];
    const directions = mapsDirectionsUrl(routePoints);
    const dayCost = day.activities.reduce((sum, activity) => sum + activity.estCostInr, 0);
    const weatherLabel = day.weather.source === "forecast" ? "Forecast" : "Typical";

    return `
      <article class="day-card" style="--day-color:${dayColors[dayIndex % dayColors.length]}">
        <div class="day-card-header">
          <div class="day-title-group">
            <span>Day ${day.dayNumber} · ${escapeHtml(weekday(day.date))}, ${escapeHtml(formatDate(day.date, { day: "numeric", month: "short" }))}${day.baseName && ctrl.itinerary.stays.length > 1 ? ` · ${escapeHtml(day.baseName)}` : ""}</span>
            <h4>${escapeHtml(day.theme)}</h4>
          </div>
          <div class="weather-badge" title="${weatherLabel} weather">🌦️ ${escapeHtml(day.weather.condition)} · ${day.weather.tempHighC}° / ${day.weather.tempLowC}°C</div>
        </div>
        <div class="day-summary">
          <span>🚗 ${day.travelKm} km · ${minutesLabel(day.travelMin)} on the road</span>
          <span>💸 ${inr(dayCost)} planned spend</span>
          ${directions ? `<a href="${escapeHtml(directions)}" target="_blank" rel="noopener">🧭 Day route in Google Maps ↗</a>` : ""}
        </div>
        <ol class="activity-timeline">
          ${day.activities.map((activity, index) => activityHtml(activity, day, index, stopIndexes.indexOf(index), stopIndexes.length)).join("")}
        </ol>
        ${
          day.alternatives?.length
            ? `<div class="alternatives">
                <span class="alternatives-label">Swap in nearby:</span>
                ${day.alternatives
                  .map(
                    (alternative) => `<button type="button" class="alt-chip" data-op="add" data-day="${day.dayNumber}" data-place="${escapeHtml(alternative.placeId)}" title="${escapeHtml(alternative.reason)}">
                      + ${escapeHtml(alternative.name)} <small>${escapeHtml(alternative.reason)}</small>
                    </button>`,
                  )
                  .join("")}
              </div>`
            : ""
        }
        <div class="day-footer-actions">
          <button type="button" class="btn btn-outline btn-sm open-picker-btn" data-action="open-picker" data-day="${day.dayNumber}">
            🏛️ Browse & add places from catalog
          </button>
        </div>
      </article>`;
  }

  function daysHtml() {
    const days = ctrl.itinerary.days;
    const visible = ctrl.activeDay === "all" ? days : days.filter((day) => String(day.dayNumber) === ctrl.activeDay);
    return `
      <div class="day-tabs-bar" role="tablist">
        <button type="button" role="tab" class="day-tab ${ctrl.activeDay === "all" ? "active" : ""}" data-tab="all" aria-selected="${ctrl.activeDay === "all"}">All days</button>
        ${days
          .map(
            (day, index) => `<button type="button" role="tab" class="day-tab ${ctrl.activeDay === String(day.dayNumber) ? "active" : ""}" data-tab="${day.dayNumber}" aria-selected="${ctrl.activeDay === String(day.dayNumber)}" style="--day-color:${dayColors[index % dayColors.length]}">Day ${day.dayNumber}</button>`,
          )
          .join("")}
      </div>
      <div class="day-cards-stack">${visible.map((day) => dayHtml(day, days.indexOf(day))).join("")}</div>`;
  }

  function catalogPickerModalHtml() {
    if (!ctrl.pickerOpen) return "";
    const currentDay = ctrl.pickerDay;
    const allPlannedIds = new Set(
      ctrl.itinerary.days.flatMap((d) => d.activities.map((a) => a.placeId).filter(Boolean))
    );

    let places = ctrl.catalogPlaces || [];
    if (ctrl.pickerQuery) {
      const q = ctrl.pickerQuery.toLowerCase().trim();
      places = places.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.interests?.some((i) => i.toLowerCase().includes(q)) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    return `
      <div class="picker-overlay" data-action="close-picker">
        <div class="picker-modal" onclick="event.stopPropagation()">
          <div class="picker-header">
            <div>
              <h3>Add Place to Day ${currentDay}</h3>
              <p class="muted small" style="margin: 0.2rem 0 0 0;">Select any attraction from ${escapeHtml(ctrl.itinerary.destination)}</p>
            </div>
            <button type="button" class="icon-btn" data-action="close-picker" aria-label="Close modal">✕</button>
          </div>
          <div class="picker-search-bar">
            <input type="search" id="catalog-picker-input" placeholder="Search by name, category (e.g. history, nature) or keyword..." value="${escapeHtml(ctrl.pickerQuery)}" autofocus />
          </div>
          <div class="picker-body">
            ${
              ctrl.catalogLoading
                ? `<div class="picker-loading" style="padding: 2rem; text-align: center; color: var(--text-muted);"><span class="spinner"></span> Loading destination catalog...</div>`
                : places.length === 0
                ? `<p class="picker-empty muted" style="padding: 2rem; text-align: center;">No places found matching "${escapeHtml(ctrl.pickerQuery)}".</p>`
                : `<div class="picker-grid">
                    ${places
                      .map((place) => {
                        const inPlan = allPlannedIds.has(place.id);
                        return `
                          <div class="picker-card ${inPlan ? "is-planned" : ""}">
                            <div class="picker-card-header">
                              <div>
                                <strong>${categoryIcons[place.category] ?? "📍"} ${escapeHtml(place.name)}</strong>
                                <span class="pill small" style="margin-left: 0.4rem;">${escapeHtml(place.category || "attraction")}</span>
                              </div>
                              ${place.rating ? `<span class="rating" style="font-weight: 600; color: #eab308;">★ ${place.rating.toFixed(1)}</span>` : ""}
                            </div>
                            ${place.description ? `<p class="picker-desc">${escapeHtml(place.description)}</p>` : ""}
                            <div class="picker-meta">
                              <span>${place.entryFeeInr ? `🎟️ ${inr(place.entryFeeInr)}` : "🎟️ Free entry"}</span>
                              ${place.durationMin ? `<span>⏱️ ${minutesLabel(place.durationMin)}</span>` : ""}
                              ${place.openingHours ? `<span>🕘 ${escapeHtml(place.openingHours)}</span>` : ""}
                            </div>
                            <div class="picker-card-action">
                              ${
                                inPlan
                                  ? `<span class="planned-tag">✓ Already in plan</span>`
                                  : `<button type="button" class="btn btn-primary btn-sm" data-op="add" data-day="${currentDay}" data-place="${escapeHtml(place.id)}">
                                      + Add to Day ${currentDay}
                                    </button>`
                              }
                            </div>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const scrollY = window.scrollY;
    destroyMap(ctrl.map);
    host.innerHTML = `
      <div class="trip-view">
        ${headerHtml()}
        <div class="trip-layout">
          <div class="trip-main">
            <section class="card-panel map-panel">
              <div class="leaflet-host" id="trip-map"></div>
              <p class="muted small map-caption">Numbered stops follow each day's route; 🏨 marks your stay and 🍽 your meals.</p>
            </section>
            ${daysHtml()}
          </div>
          <aside class="trip-side">
            ${costHtml()}
            ${staysHtml()}
            ${dishesHtml()}
            ${notesHtml()}
          </aside>
        </div>
        ${catalogPickerModalHtml()}
      </div>`;
    ctrl.map = createMap(host.querySelector("#trip-map"), ctrl.itinerary.center ?? { lat: 22.5, lon: 79 }, 11);
    renderItineraryMap(ctrl.map, ctrl.itinerary, ctrl.activeDay);
    window.scrollTo({ top: scrollY });
  }

  // ---- Events --------------------------------------------------------------

  host.addEventListener("click", async (event) => {
    const tab = event.target.closest(".day-tab");
    if (tab) {
      ctrl.activeDay = tab.dataset.tab;
      host.querySelectorAll(".day-tab").forEach((button) => {
        const active = button === tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      const days = ctrl.itinerary.days;
      const visible = ctrl.activeDay === "all" ? days : days.filter((day) => String(day.dayNumber) === ctrl.activeDay);
      host.querySelector(".day-cards-stack").innerHTML = visible.map((day) => dayHtml(day, days.indexOf(day))).join("");
      renderItineraryMap(ctrl.map, ctrl.itinerary, ctrl.activeDay);
      return;
    }

    const toggle = event.target.closest("[data-toggle-stay]");
    if (toggle) {
      ctrl.openStay = ctrl.openStay === toggle.dataset.toggleStay ? null : toggle.dataset.toggleStay;
      render();
      return;
    }

    const opButton = event.target.closest("[data-op]");
    if (opButton) {
      const dayNumber = Number(opButton.dataset.day);
      const index = Number(opButton.dataset.index);
      switch (opButton.dataset.op) {
        case "remove":
          return applyOperation({ type: "remove", dayNumber, index }, "Stop removed — times and costs updated");
        case "move":
          return applyOperation({ type: "move", dayNumber, index, direction: Number(opButton.dataset.dir) });
        case "swap":
          return applyOperation({ type: "swapMeal", dayNumber, index }, "Restaurant swapped");
        case "add":
          ctrl.pickerOpen = false;
          return applyOperation({ type: "add", dayNumber, placeId: opButton.dataset.place }, "Added to your day");
        case "hotel":
          ctrl.openStay = null;
          return applyOperation({ type: "setHotel", baseKey: opButton.dataset.base, hotelId: opButton.dataset.hotel }, "Hotel updated");
      }
    }

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "open-picker") {
      const dayEl = event.target.closest("[data-day]");
      const day = dayEl ? Number(dayEl.dataset.day) : 1;
      ctrl.pickerOpen = true;
      ctrl.pickerDay = day;
      ctrl.pickerQuery = "";
      if (!ctrl.catalogPlaces) {
        ctrl.catalogLoading = true;
        render();
        try {
          const destKey = ctrl.itinerary.destinationKey || ctrl.itinerary.destination.toLowerCase();
          const res = await api(`/api/destinations/${destKey}`);
          ctrl.catalogPlaces = res?.destination?.attractions ?? [];
        } catch {
          const seen = new Set();
          ctrl.catalogPlaces = ctrl.itinerary.days
            .flatMap((d) => (d.alternatives || []).map((a) => ({ id: a.placeId, name: a.name, category: a.category, description: a.reason })))
            .filter((p) => !seen.has(p.id) && seen.add(p.id));
        } finally {
          ctrl.catalogLoading = false;
          render();
        }
        return;
      }
      render();
      return;
    }
    if (action === "close-picker") {
      ctrl.pickerOpen = false;
      ctrl.pickerDay = null;
      render();
      return;
    }
    if (action === "save") return saveToAccount();
    if (action === "regenerate") return regenerate({ seed: (ctrl.itinerary.seed ?? 0) + 1 });
    if (action === "print") return window.print();
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(itineraryAsText(ctrl.itinerary, ctrl.title));
        toast("Itinerary copied to clipboard", "success");
      } catch {
        toast("Couldn't access the clipboard", "error");
      }
      return;
    }
    if (action === "duplicate") {
      try {
        const { trip } = await api(`/api/trips/${ctrl.savedTripId}/duplicate`, { method: "POST" });
        toast("Trip duplicated", "success");
        location.hash = `#/trip/${trip.id}`;
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    if (action === "delete") {
      if (!confirm(`Delete "${ctrl.title}"? This can't be undone.`)) return;
      try {
        await api(`/api/trips/${ctrl.savedTripId}`, { method: "DELETE" });
        toast("Trip deleted", "success");
        location.hash = "#/trips";
      } catch (error) {
        toast(error.message, "error");
      }
    }
  });

  host.addEventListener("change", (event) => {
    const target = event.target;
    const itinerary = ctrl.itinerary;
    if (target.dataset?.op === "moveDay") {
      const fromDayNumber = Number(target.dataset.fromDay);
      const index = Number(target.dataset.index);
      const toDayNumber = Number(target.value);
      if (toDayNumber && toDayNumber !== fromDayNumber) {
        return applyOperation(
          { type: "moveDay", fromDayNumber, toDayNumber, index },
          `Moved stop to Day ${toDayNumber}`
        );
      }
    }
    if (target.id === "set-start" && target.value && target.value !== itinerary.startDate) {
      return applyOperation({ type: "setStartDate", startDate: target.value }, "Dates updated");
    }
    if (target.id === "set-travelers") {
      return applyOperation({ type: "setTravelers", travelers: Number(target.value) }, "Costs updated for your group");
    }
    if (target.id === "set-days") {
      const days = Number(target.value);
      return regenerate({ endDate: addDays(itinerary.startDate, days - 1) }, `Plan rebuilt for ${days} day${days === 1 ? "" : "s"}`);
    }
    if (target.id === "set-style") {
      return regenerate({ travelStyle: target.value }, `Switched to ${styleLabels[target.value].toLowerCase()} recommendations`);
    }
    if (target.id === "set-pace") {
      return regenerate({ pace: target.value }, `Rebuilt at a ${target.value} pace`);
    }
    if (target.id === "trip-title-input") {
      const title = target.value.trim();
      if (!title || title === ctrl.title) return;
      ctrl.title = title;
      return persist({ title });
    }
    if (target.id === "trip-notes") {
      ctrl.notes = target.value;
      return persist({ notes: ctrl.notes });
    }
  });

  host.addEventListener("input", (event) => {
    if (event.target.id === "catalog-picker-input") {
      ctrl.pickerQuery = event.target.value;
      const body = host.querySelector(".picker-body");
      if (!body) return;
      const allPlannedIds = new Set(
        ctrl.itinerary.days.flatMap((d) => d.activities.map((a) => a.placeId).filter(Boolean))
      );
      let places = ctrl.catalogPlaces || [];
      const q = ctrl.pickerQuery.toLowerCase().trim();
      if (q) {
        places = places.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.category?.toLowerCase().includes(q) ||
            p.interests?.some((i) => i.toLowerCase().includes(q)) ||
            p.description?.toLowerCase().includes(q)
        );
      }
      body.innerHTML =
        places.length === 0
          ? `<p class="picker-empty muted" style="padding: 2rem; text-align: center;">No places found matching "${escapeHtml(ctrl.pickerQuery)}".</p>`
          : `<div class="picker-grid">${places
              .map((place) => {
                const inPlan = allPlannedIds.has(place.id);
                return `
                  <div class="picker-card ${inPlan ? "is-planned" : ""}">
                    <div class="picker-card-header">
                      <div>
                        <strong>${categoryIcons[place.category] ?? "📍"} ${escapeHtml(place.name)}</strong>
                        <span class="pill small" style="margin-left: 0.4rem;">${escapeHtml(place.category || "attraction")}</span>
                      </div>
                      ${place.rating ? `<span class="rating" style="font-weight: 600; color: #eab308;">★ ${place.rating.toFixed(1)}</span>` : ""}
                    </div>
                    ${place.description ? `<p class="picker-desc">${escapeHtml(place.description)}</p>` : ""}
                    <div class="picker-meta">
                      <span>${place.entryFeeInr ? `🎟️ ${inr(place.entryFeeInr)}` : "🎟️ Free entry"}</span>
                      ${place.durationMin ? `<span>⏱️ ${minutesLabel(place.durationMin)}</span>` : ""}
                      ${place.openingHours ? `<span>🕘 ${escapeHtml(place.openingHours)}</span>` : ""}
                    </div>
                    <div class="picker-card-action">
                      ${
                        inPlan
                          ? `<span class="planned-tag">✓ Already in plan</span>`
                          : `<button type="button" class="btn btn-primary btn-sm" data-op="add" data-day="${ctrl.pickerDay}" data-place="${escapeHtml(place.id)}">
                              + Add to Day ${ctrl.pickerDay}
                            </button>`
                      }
                    </div>
                  </div>`;
              })
              .join("")}</div>`;
    }
  });

  render();
  persistDraft();
  return {
    destroy() {
      destroyMap(ctrl.map);
    },
  };
}
