import { api } from "../api.js";
import { findCuratedKey, state } from "../state.js";
import { escapeHtml, formatDateRange, hydrateImages, inr, toast } from "../ui.js";
import { mountTrip, preferencesFromItinerary } from "./trip.js";
import { openAuthModal } from "./auth.js";

const statusLabels = { upcoming: "Upcoming", ongoing: "On the road", past: "Past" };

function tripCard(trip) {
  const destination = state.destinations.find((entry) => entry.key === trip.destinationKey);
  return `
    <article class="trip-card">
      <a class="trip-card-media" href="#/trip/${trip.id}" ${destination ? `data-wiki="${escapeHtml(destination.wiki)}" data-alt="${escapeHtml(trip.destination)}"` : ""}>
        <span class="status-badge status-${trip.status}">${statusLabels[trip.status]}</span>
        <span class="destination-emoji" aria-hidden="true">${destination?.emoji ?? "🧭"}</span>
      </a>
      <div class="trip-card-body">
        <h3><a href="#/trip/${trip.id}">${escapeHtml(trip.title)}</a></h3>
        <p class="muted small">📍 ${escapeHtml(trip.destination)} · 🗓️ ${escapeHtml(formatDateRange(trip.startDate, trip.endDate))}</p>
        <p class="muted small">${trip.days} days · 👤 ${trip.travelers} · ${inr(trip.totalCostInr)} est.</p>
        <div class="card-actions">
          <a class="btn-action" href="#/trip/${trip.id}">Open</a>
          <button type="button" class="btn-action" data-duplicate="${trip.id}">⧉ Duplicate</button>
          <button type="button" class="btn-action danger" data-delete="${trip.id}" data-title="${escapeHtml(trip.title)}">🗑️ Delete</button>
        </div>
      </div>
    </article>`;
}

export async function renderDashboard(container) {
  if (!state.user) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-illustration">🔐</div>
        <h3>Log in to see your trips</h3>
        <p>Your saved itineraries, upcoming trips and past adventures live here.</p>
        <div class="empty-actions">
          <button type="button" class="primary-cta-button compact" data-auth="login">Log in</button>
          <button type="button" class="btn-secondary" data-auth="signup">Create account</button>
        </div>
      </div>`;
    container.querySelectorAll("[data-auth]").forEach((button) => button.addEventListener("click", () => openAuthModal(button.dataset.auth)));
    return;
  }

  container.innerHTML = `<div class="page-loading">Loading your trips…</div>`;
  let trips = [];
  try {
    ({ trips } = await api("/api/trips"));
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h3>Couldn't load trips</h3><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }

  let filter = "upcoming";
  const counts = {
    upcoming: trips.filter((trip) => trip.status !== "past").length,
    past: trips.filter((trip) => trip.status === "past").length,
    all: trips.length,
  };

  const render = () => {
    const visible = trips
      .filter((trip) => filter === "all" || (filter === "upcoming" ? trip.status !== "past" : trip.status === "past"))
      .sort((a, b) => (filter === "upcoming" ? a.startDate.localeCompare(b.startDate) : b.updatedAt.localeCompare(a.updatedAt)));
    const recent = state.recent ?? [];

    container.innerHTML = `
      <section class="page-intro flex-between">
        <div>
          <h1>My trips</h1>
          <p>Hi ${escapeHtml(state.user.name.split(" ")[0])} — every plan you generate is saved here.</p>
        </div>
        <a class="primary-cta-button compact" href="#/plan">✨ New trip</a>
      </section>

      <div class="stat-row">
        <div class="stat"><strong>${counts.all}</strong><span>Saved plans</span></div>
        <div class="stat"><strong>${counts.upcoming}</strong><span>Upcoming</span></div>
        <div class="stat"><strong>${counts.past}</strong><span>Past</span></div>
        <div class="stat"><strong>${new Set(trips.map((trip) => trip.destination)).size}</strong><span>Destinations</span></div>
      </div>

      <div class="filter-bar" role="tablist">
        ${[
          ["upcoming", "Upcoming"],
          ["past", "Past"],
          ["all", "All saved"],
        ]
          .map(([value, label]) => `<button type="button" role="tab" class="chip ${filter === value ? "active" : ""}" data-filter="${value}" aria-selected="${filter === value}">${label} (${counts[value]})</button>`)
          .join("")}
      </div>

      ${
        visible.length
          ? `<div class="trip-grid">${visible.map(tripCard).join("")}</div>`
          : `<div class="empty-state small-empty"><h3>No ${filter === "all" ? "" : filter} trips yet</h3><p>Plan something new — it'll appear here automatically.</p><a class="primary-cta-button compact" href="#/plan">Plan a trip</a></div>`
      }

      ${
        recent.length
          ? `<section class="section">
              <div class="section-head"><div><h2>Recently viewed destinations</h2></div></div>
              <div class="chip-row">${recent
                .map((entry) => {
                  const key = entry.key ?? findCuratedKey(entry.name);
                  return `<a class="pill-link large" href="${key ? `#/destination/${key}` : `#/plan?destination=${encodeURIComponent(entry.name)}`}">🕘 ${escapeHtml(entry.name)}</a>`;
                })
                .join("")}</div>
            </section>`
          : ""
      }`;
    hydrateImages(container);
  };

  container.addEventListener("click", async (event) => {
    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      filter = filterButton.dataset.filter;
      render();
      return;
    }
    const duplicate = event.target.closest("[data-duplicate]");
    if (duplicate) {
      try {
        const { trip } = await api(`/api/trips/${duplicate.dataset.duplicate}/duplicate`, { method: "POST" });
        trips = [trip, ...trips];
        counts.all += 1;
        counts[trip.status === "past" ? "past" : "upcoming"] += 1;
        toast("Trip duplicated", "success");
        render();
      } catch (error) {
        toast(error.message, "error");
      }
      return;
    }
    const remove = event.target.closest("[data-delete]");
    if (remove) {
      if (!confirm(`Delete "${remove.dataset.title}"? This can't be undone.`)) return;
      try {
        await api(`/api/trips/${remove.dataset.delete}`, { method: "DELETE" });
        const removed = trips.find((trip) => trip.id === remove.dataset.delete);
        trips = trips.filter((trip) => trip.id !== remove.dataset.delete);
        counts.all -= 1;
        if (removed) counts[removed.status === "past" ? "past" : "upcoming"] -= 1;
        toast("Trip deleted", "success");
        render();
      } catch (error) {
        toast(error.message, "error");
      }
    }
  });

  render();
}

export async function renderSavedTrip(container, { id }) {
  if (!state.user) {
    container.innerHTML = `<div class="empty-state"><h3>Log in to open this trip</h3><button type="button" class="primary-cta-button compact" id="trip-login">Log in</button></div>`;
    container.querySelector("#trip-login").addEventListener("click", () => openAuthModal("login", "", () => window.dispatchEvent(new HashChangeEvent("hashchange"))));
    return;
  }
  container.innerHTML = `<div class="page-loading">Loading trip…</div>`;
  try {
    const { trip } = await api(`/api/trips/${encodeURIComponent(id)}`);
    container.innerHTML = `<a class="back-link" href="#/trips">← My trips</a><div id="saved-trip-host"></div>`;
    const handle = mountTrip(container.querySelector("#saved-trip-host"), {
      itinerary: trip.itinerary,
      savedTripId: trip.id,
      title: trip.title,
      notes: trip.notes,
      preferences: preferencesFromItinerary(trip.itinerary, trip.preferences ?? {}),
    });
    return () => handle.destroy();
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h3>Trip not found</h3><p>${escapeHtml(error.message)}</p><a class="primary-cta-button compact" href="#/trips">Back to my trips</a></div>`;
  }
}
