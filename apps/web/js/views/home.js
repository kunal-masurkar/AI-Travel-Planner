import { api } from "../api.js";
import { findCuratedKey, state } from "../state.js";
import { escapeHtml, formatDateRange, hydrateImages, inr, monthNames } from "../ui.js";

function bestMonthsLabel(months) {
  if (!months?.length) return "";
  // Collapse consecutive months (wrapping around the year) into ranges like "Oct–Mar".
  const sorted = [...months].sort((a, b) => a - b);
  const ranges = [];
  for (const month of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && month === last[1] + 1) last[1] = month;
    else ranges.push([month, month]);
  }
  if (ranges.length > 1 && ranges[0][0] === 1 && ranges[ranges.length - 1][1] === 12) {
    const first = ranges.shift();
    ranges[ranges.length - 1][1] = first[1];
  }
  return ranges.map(([from, to]) => (from === to ? monthNames[from - 1] : `${monthNames[from - 1]}–${monthNames[to - 1]}`)).join(", ");
}

export function destinationCard(destination) {
  const currentMonth = new Date().getMonth() + 1;
  const inSeason = destination.bestMonths.includes(currentMonth);
  return `
    <article class="destination-card">
      <a class="destination-media" href="#/destination/${destination.key}" data-wiki="${escapeHtml(destination.wiki)}" data-alt="${escapeHtml(destination.name)}">
        <span class="destination-emoji" aria-hidden="true">${destination.emoji}</span>
        ${inSeason ? `<span class="season-flag">In season now</span>` : ""}
      </a>
      <div class="destination-body">
        <div class="destination-title-row">
          <h3><a href="#/destination/${destination.key}">${escapeHtml(destination.name)}</a></h3>
          <span class="muted small">${escapeHtml(destination.state)}</span>
        </div>
        <p class="destination-tagline">${escapeHtml(destination.tagline)}</p>
        <dl class="destination-facts">
          <div><dt>Best time</dt><dd>${escapeHtml(bestMonthsLabel(destination.bestMonths))}</dd></div>
          <div><dt>3 days from</dt><dd>${inr(destination.perPersonFrom3Days.budget)}<span class="muted small"> pp</span></dd></div>
        </dl>
        <div class="duration-links" aria-label="Plan a trip of this length">
          ${destination.durations.map((days) => `<a class="pill-link" href="#/plan?destination=${encodeURIComponent(destination.name)}&days=${days}">${days} days</a>`).join("")}
        </div>
      </div>
    </article>`;
}

export async function renderHome(container) {
  const destinations = state.destinations;
  const recent = state.recent ?? [];
  const destinationOptions = destinations.map((destination) => `<option value="${escapeHtml(destination.name)}"></option>`).join("");

  container.innerHTML = `
    <section class="hero-section">
      <div class="hero-content">
        <div class="hero-badge"><span>✨</span> Smart itineraries for Incredible India</div>
        <h1 class="hero-title">Where in India are you <span class="gradient-text">headed next?</span></h1>
        <p class="hero-description">Compare 3, 4, 5 and 7-day plans, see what a trip really costs, discover places, food and stays, and keep every plan in your account.</p>
        <form class="search-bar" id="home-search" role="search">
          <span class="search-icon" aria-hidden="true">📍</span>
          <label class="sr-only" for="home-search-input">Search a destination</label>
          <input id="home-search-input" list="home-destinations" placeholder="Search Goa, Jaipur, Kerala, Manali, Shillong…" autocomplete="off" required />
          <datalist id="home-destinations">${destinationOptions}</datalist>
          <button type="submit" class="primary-cta-button compact">Explore</button>
        </form>
        <p class="search-hint muted small">Curated guides for ${destinations.length} destinations · any other Indian city works too.</p>
      </div>
    </section>

    <div id="home-personal"></div>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Popular destinations</h2>
          <p>Highlights, best season and typical costs at a glance.</p>
        </div>
      </div>
      <div class="destination-grid">${destinations.map(destinationCard).join("")}</div>
    </section>

    ${
      recent.length
        ? `<section class="section">
            <div class="section-head"><div><h2>Recently viewed</h2></div></div>
            <div class="chip-row">${recent
              .map((entry) => {
                const key = entry.key ?? findCuratedKey(entry.name);
                const href = key ? `#/destination/${key}` : `#/plan?destination=${encodeURIComponent(entry.name)}`;
                return `<a class="pill-link large" href="${href}">🕘 ${escapeHtml(entry.name)}</a>`;
              })
              .join("")}</div>
          </section>`
        : ""
    }
  `;

  container.querySelector("#home-search").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = container.querySelector("#home-search-input").value.trim();
    if (!value) return;
    const key = findCuratedKey(value);
    location.hash = key ? `#/destination/${key}` : `#/plan?destination=${encodeURIComponent(value)}`;
  });

  hydrateImages(container);

  if (state.user) {
    const personal = container.querySelector("#home-personal");
    const { trips } = await api("/api/trips").catch(() => ({ trips: [] }));
    const upcoming = trips.filter((trip) => trip.status !== "past").sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 3);
    if (!personal.isConnected) return;
    personal.innerHTML = `
      <section class="section">
        <div class="section-head">
          <div>
            <h2>Welcome back, ${escapeHtml(state.user.name.split(" ")[0])}</h2>
            <p>${trips.length ? `You have ${trips.length} saved plan${trips.length === 1 ? "" : "s"}.` : "Plans you generate are saved here automatically."}</p>
          </div>
          <a class="btn-secondary" href="#/trips">Open dashboard →</a>
        </div>
        ${
          upcoming.length
            ? `<div class="trip-mini-grid">${upcoming
                .map(
                  (trip) => `
                <a class="trip-mini" href="#/trip/${trip.id}">
                  <strong>${escapeHtml(trip.title)}</strong>
                  <span>${escapeHtml(formatDateRange(trip.startDate, trip.endDate))}</span>
                  <span class="muted small">${trip.days} days · ${inr(trip.totalCostInr)}</span>
                </a>`,
                )
                .join("")}</div>`
            : ""
        }
      </section>`;
  }
}

export { bestMonthsLabel };
