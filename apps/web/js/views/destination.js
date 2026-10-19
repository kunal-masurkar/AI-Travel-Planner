import { api } from "../api.js";
import { createMap, destroyMap, renderPlacesMap } from "../map.js";
import { recordRecent } from "../state.js";
import {
  attractionTypeLabels,
  bestTimeLabels,
  escapeHtml,
  hydrateImages,
  inr,
  mapsSearchUrl,
  minutesLabel,
  monthNames,
  styleLabels,
  wikiLink,
} from "../ui.js";
import { bestMonthsLabel } from "./home.js";

const levelClass = { low: "level-low", moderate: "level-moderate", high: "level-high", "very high": "level-very-high" };

function seasonSection(destination) {
  const season = destination.season;
  const currentMonth = new Date().getMonth() + 1;
  const monthCells = monthNames
    .map((name, index) => {
      const month = index + 1;
      const period = season.periods.find((entry) => entry.months.includes(month));
      const best = season.bestMonths.includes(month);
      return `<div class="month-cell ${best ? "best" : ""} ${month === currentMonth ? "current" : ""}" title="${escapeHtml(period?.name ?? "")}">
        <span>${name}</span>
        ${period ? `<small>${period.tempC[0]}–${period.tempC[1]}°</small>` : ""}
      </div>`;
    })
    .join("");

  return `
    <section class="card-panel" id="season">
      <div class="panel-header"><div class="panel-icon">🌤️</div><div><h2>Best time to visit</h2><p>${escapeHtml(season.summary)}</p></div></div>
      <div class="month-strip" aria-label="Month by month">${monthCells}</div>
      <p class="legend muted small"><span class="legend-swatch best"></span> Best months: ${escapeHtml(bestMonthsLabel(season.bestMonths))}</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Season</th><th>Months</th><th>Temp</th><th>Rain</th><th>Crowds</th><th>What to expect</th></tr></thead>
          <tbody>
            ${season.periods
              .map(
                (period) => `<tr>
                  <td><strong>${escapeHtml(period.name)}</strong></td>
                  <td>${escapeHtml(bestMonthsLabel(period.months))}</td>
                  <td>${period.tempC[0]}–${period.tempC[1]} °C</td>
                  <td><span class="level ${levelClass[period.rainfall]}">${escapeHtml(period.rainfall)}</span></td>
                  <td><span class="level ${levelClass[period.crowds]}">${escapeHtml(period.crowds)}</span></td>
                  <td>${escapeHtml(period.notes)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="grid-3">
        <div>
          <h3 class="subhead">🎉 Festivals & events</h3>
          <ul class="plain-list">${season.festivals.map((festival) => `<li><strong>${escapeHtml(festival.name)}</strong> <span class="muted small">${escapeHtml(bestMonthsLabel(festival.months))}</span><br /><span class="muted">${escapeHtml(festival.description)}</span></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="subhead">🗓️ Seasonal activities</h3>
          <ul class="plain-list">${season.seasonalActivities.map((item) => `<li>${escapeHtml(item.activity)} <span class="muted small">${escapeHtml(bestMonthsLabel(item.months))}</span></li>`).join("")}</ul>
        </div>
        <div>
          <h3 class="subhead">⚠️ Good to know</h3>
          <ul class="plain-list">${season.considerations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      </div>
    </section>`;
}

function costSection(destination, estimates) {
  const styles = ["budget", "mid", "premium"];
  return `
    <section class="card-panel" id="costs">
      <div class="panel-header flex-between">
        <div class="flex-align"><div class="panel-icon">💰</div><div><h2>Trip cost estimates</h2><p>For ${estimates.travelers} traveller${estimates.travelers === 1 ? "" : "s"}, excluding travel to ${escapeHtml(destination.name)}.</p></div></div>
        <div class="stepper-control small-stepper" aria-label="Travellers">
          <button type="button" class="btn-stepper" data-travelers="${estimates.travelers - 1}" ${estimates.travelers <= 1 ? "disabled" : ""} aria-label="Fewer travellers">−</button>
          <span>${estimates.travelers} 👤</span>
          <button type="button" class="btn-stepper" data-travelers="${estimates.travelers + 1}" aria-label="More travellers">+</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table cost-table">
          <thead><tr><th>Duration</th>${styles.map((style) => `<th>${styleLabels[style]}</th>`).join("")}</tr></thead>
          <tbody>
            ${estimates.durations
              .map(
                (row) => `<tr>
                  <td><strong>${row.days} days</strong><br /><span class="muted small">${row.days - 1} nights</span></td>
                  ${styles
                    .map((style) => {
                      const cost = row.styles[style];
                      return `<td>
                        <button type="button" class="cost-cell" data-days="${row.days}" data-style="${style}">
                          <strong>${inr(cost.total)}</strong>
                          <span>${inr(cost.perPerson)} per person</span>
                        </button>
                      </td>`;
                    })
                    .join("")}
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div id="cost-detail" class="cost-detail"></div>
      <p class="muted small">Estimates use indicative hotel, restaurant and ticket prices for the recommended plan. Select a cell to see the breakdown.</p>
    </section>`;
}

function costDetail(destination, estimates, days, style) {
  const row = estimates.durations.find((entry) => entry.days === days);
  const cost = row?.styles[style];
  if (!cost) return "";
  const categories = [
    ["accommodation", "🏨 Accommodation"],
    ["food", "🍽️ Food & restaurants"],
    ["localTransport", "🚗 Local transport"],
    ["sightseeing", "🎟️ Sightseeing & entry tickets"],
    ["activities", "🧗 Activities & experiences"],
    ["misc", "🧾 Miscellaneous"],
  ];
  return `
    <div class="cost-detail-inner">
      <div>
        <h3>${days}-day ${styleLabels[style].toLowerCase()} trip</h3>
        <div class="breakdown-bars">
          ${categories
            .map(([key, label]) => {
              const share = cost.total ? (cost[key] / cost.total) * 100 : 0;
              return `<div class="breakdown-row"><span>${label}</span><div class="bar"><span style="width:${share.toFixed(1)}%"></span></div><strong>${inr(cost[key])}</strong></div>`;
            })
            .join("")}
        </div>
        <div class="breakdown-total"><span>Total for ${cost.travelers}</span><strong>${inr(cost.total)}</strong></div>
        <div class="breakdown-total muted"><span>Per person</span><strong>${inr(cost.perPerson)}</strong></div>
      </div>
      <div>
        <h3 class="subhead">What the plan covers</h3>
        <ol class="plain-list numbered">${cost.highlights.map((theme) => `<li>${escapeHtml(theme)}</li>`).join("")}</ol>
        <a class="primary-cta-button compact" href="#/plan?destination=${encodeURIComponent(destination.name)}&days=${days}&style=${style}&travelers=${cost.travelers}">Build this ${days}-day plan →</a>
      </div>
    </div>`;
}

function placeCard(place) {
  const fee = place.entryFeeInr > 0 ? `${inr(place.entryFeeInr)} entry` : "Free entry";
  const extra = place.activityFeeInr ? ` · ${inr(place.activityFeeInr)} experience` : "";
  return `
    <article class="place-card" data-type="${place.type}">
      <div class="place-media" ${place.wiki ? `data-wiki="${escapeHtml(place.wiki)}" data-alt="${escapeHtml(place.name)}"` : ""}>
        <span class="type-badge">${escapeHtml(attractionTypeLabels[place.type] ?? place.type)}</span>
      </div>
      <div class="place-body">
        <h3>${escapeHtml(place.name)}</h3>
        <span class="muted small">📍 ${escapeHtml(place.area)}</span>
        <p>${escapeHtml(place.description)}</p>
        <ul class="fact-list">
          <li title="Opening hours">🕘 ${escapeHtml(place.openingHours)}</li>
          <li title="Entry fee">🎟️ ${escapeHtml(fee + extra)}</li>
          <li title="Typical visit">⏱️ ${minutesLabel(place.durationMin)} · best ${escapeHtml(bestTimeLabels[place.bestTime]?.toLowerCase() ?? "any time")}</li>
        </ul>
        ${place.tips ? `<p class="tip">💡 ${escapeHtml(place.tips)}</p>` : ""}
        <div class="card-links">
          <a href="${mapsSearchUrl(place.lat, place.lon, place.name)}" target="_blank" rel="noopener">Map ↗</a>
          ${place.wiki ? `<a href="${wikiLink(place.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ""}
        </div>
      </div>
    </article>`;
}

function restaurantCard(restaurant) {
  return `
    <article class="list-card" data-tier="${restaurant.priceTier}" data-family="${restaurant.familyFriendly}">
      <div class="list-card-head">
        <h3>${escapeHtml(restaurant.name)}</h3>
        <span class="rating" title="Indicative rating">★ ${restaurant.rating.toFixed(1)}</span>
      </div>
      <span class="muted small">${escapeHtml(restaurant.cuisine)} · 📍 ${escapeHtml(restaurant.area)}</span>
      <p><strong>Try:</strong> ${escapeHtml(restaurant.specialties.join(", "))}</p>
      <div class="tag-row">
        <span class="tag tier-${restaurant.priceTier}">${styleLabels[restaurant.priceTier]} · ${inr(restaurant.costForTwoInr)} for two</span>
        ${restaurant.familyFriendly ? `<span class="tag">👨‍👩‍👧 Family-friendly</span>` : ""}
      </div>
      <span class="muted small">🕘 ${escapeHtml(restaurant.openingHours)}</span>
      <div class="card-links"><a href="${mapsSearchUrl(restaurant.lat, restaurant.lon, restaurant.name)}" target="_blank" rel="noopener">Map ↗</a></div>
    </article>`;
}

function hotelCard(hotel, destination) {
  const base = destination.bases.find((entry) => entry.key === hotel.base);
  const booking = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${hotel.name}, ${base?.name ?? destination.name}, India`)}`;
  return `
    <article class="list-card" data-tier="${hotel.tier}" data-hoteltype="${hotel.type}">
      <div class="list-card-head">
        <h3>${escapeHtml(hotel.name)}</h3>
        <span class="rating" title="Indicative rating">★ ${hotel.rating.toFixed(1)}</span>
      </div>
      <span class="muted small">${escapeHtml(hotel.type)} · 📍 ${escapeHtml(hotel.area)}${destination.bases.length > 1 ? `, ${escapeHtml(base?.name ?? "")}` : ""}</span>
      <p>${escapeHtml(hotel.description)}</p>
      <div class="tag-row">
        <span class="tag tier-${hotel.tier}">${styleLabels[hotel.tier]} · from ${inr(hotel.pricePerNightInr)}/${hotel.type === "hostel" ? "bed" : "night"}</span>
        ${hotel.amenities.slice(0, 3).map((amenity) => `<span class="tag">${escapeHtml(amenity)}</span>`).join("")}
      </div>
      <div class="card-links">
        <a href="${booking}" target="_blank" rel="noopener">Check prices on Booking.com ↗</a>
        <a href="${mapsSearchUrl(hotel.lat, hotel.lon, hotel.name)}" target="_blank" rel="noopener">Map ↗</a>
      </div>
    </article>`;
}

function filterBar(name, options) {
  return `<div class="filter-bar" role="group" aria-label="Filter ${name}" data-filter-group="${name}">
    ${options.map(([value, label], index) => `<button type="button" class="chip ${index === 0 ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
  </div>`;
}

export async function renderDestination(container, { key }) {
  container.innerHTML = `<div class="page-loading">Loading destination…</div>`;
  let travelers = 2;
  let data;
  try {
    data = await api(`/api/destinations/${encodeURIComponent(key)}?travelers=${travelers}`);
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h3>Destination not found</h3><p>${escapeHtml(error.message)}</p><a class="primary-cta-button compact" href="#/">Back to destinations</a></div>`;
    return;
  }
  const destination = data.destination;
  recordRecent(destination.name, destination.key);

  const attractionTypes = [...new Set(destination.attractions.map((place) => place.type))];

  container.innerHTML = `
    <section class="destination-hero" data-wiki-width="1280" data-wiki="${escapeHtml(destination.wiki)}" data-alt="${escapeHtml(destination.name)}">
      <div class="destination-hero-content">
        <a class="back-link" href="#/">← All destinations</a>
        <span class="hero-badge">${destination.emoji} ${escapeHtml(destination.state)}</span>
        <h1>${escapeHtml(destination.name)}</h1>
        <p class="hero-description">${escapeHtml(destination.description)}</p>
        <div class="chip-row">${destination.highlights.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>
        <div class="hero-actions">
          <a class="primary-cta-button compact" href="#/plan?destination=${encodeURIComponent(destination.name)}">✨ Plan a trip</a>
          <a class="btn-secondary" href="#costs">Compare costs</a>
        </div>
      </div>
    </section>

    <nav class="section-nav" aria-label="Sections">
      <a href="#season">Season</a><a href="#costs">Costs</a><a href="#places">Places</a><a href="#food">Food</a><a href="#stays">Stays</a><a href="#map">Map</a>
    </nav>

    <div class="stack">
      ${seasonSection(destination)}
      <div id="cost-section">${costSection(destination, data.estimates)}</div>

      <section class="card-panel" id="places">
        <div class="panel-header"><div class="panel-icon">🏛️</div><div><h2>Places to visit</h2><p>${destination.attractions.length} attractions, from must-sees to hidden gems. Fees are indicative for Indian adults.</p></div></div>
        ${filterBar("places", [["all", "All"], ...attractionTypes.map((type) => [type, attractionTypeLabels[type] ?? type])])}
        <div class="place-grid" data-filter-target="places">${destination.attractions
          .slice()
          .sort((a, b) => b.popularity - a.popularity)
          .map(placeCard)
          .join("")}</div>
      </section>

      <section class="card-panel" id="food">
        <div class="panel-header"><div class="panel-icon">🍲</div><div><h2>Food & restaurants</h2><p>Local dishes to try and where to eat them.</p></div></div>
        <h3 class="subhead">Must-try dishes</h3>
        <div class="dish-grid">${destination.mustTryDishes.map((dish) => `<div class="dish"><strong>${escapeHtml(dish.name)}</strong><span>${escapeHtml(dish.description)}</span></div>`).join("")}</div>
        <h3 class="subhead">Restaurants</h3>
        ${filterBar("food", [["all", "All"], ["budget", "Budget"], ["mid", "Mid-range"], ["premium", "Premium"], ["family", "Family-friendly"]])}
        <div class="list-grid" data-filter-target="food">${destination.restaurants
          .slice()
          .sort((a, b) => b.rating - a.rating)
          .map(restaurantCard)
          .join("")}</div>
      </section>

      <section class="card-panel" id="stays">
        <div class="panel-header"><div class="panel-icon">🏨</div><div><h2>Where to stay</h2><p>Indicative starting prices — check live rates before booking.</p></div></div>
        ${filterBar("stays", [["all", "All"], ["budget", "Budget"], ["mid", "Mid-range"], ["premium", "Premium"], ["hostel", "Hostels"], ["homestay", "Homestays"], ["resort", "Resorts"]])}
        <div class="list-grid" data-filter-target="stays">${destination.hotels
          .slice()
          .sort((a, b) => ["budget", "mid", "premium"].indexOf(a.tier) - ["budget", "mid", "premium"].indexOf(b.tier))
          .map((hotel) => hotelCard(hotel, destination))
          .join("")}</div>
      </section>

      <section class="card-panel" id="map">
        <div class="panel-header"><div class="panel-icon">🗺️</div><div><h2>Map</h2><p>Attractions, restaurants and hotels. Toggle layers in the corner.</p></div></div>
        <div class="leaflet-host tall" id="places-map"></div>
      </section>
    </div>
  `;

  hydrateImages(container);

  // Filters
  container.querySelectorAll("[data-filter-group]").forEach((bar) => {
    const target = container.querySelector(`[data-filter-target="${bar.dataset.filterGroup}"]`);
    bar.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-filter]");
      if (!chip) return;
      bar.querySelectorAll(".chip").forEach((element) => element.classList.toggle("active", element === chip));
      const filter = chip.dataset.filter;
      target.querySelectorAll(":scope > article").forEach((card) => {
        const matches =
          filter === "all" ||
          card.dataset.type === filter ||
          card.dataset.tier === filter ||
          card.dataset.hoteltype === filter ||
          (filter === "family" && card.dataset.family === "true");
        card.hidden = !matches;
      });
    });
  });

  // Cost table interactions
  const costHost = container.querySelector("#cost-section");
  let selected = { days: 3, style: "mid" };
  const showDetail = () => {
    costHost.querySelectorAll(".cost-cell").forEach((cell) => cell.classList.toggle("active", Number(cell.dataset.days) === selected.days && cell.dataset.style === selected.style));
    costHost.querySelector("#cost-detail").innerHTML = costDetail(destination, data.estimates, selected.days, selected.style);
  };
  costHost.addEventListener("click", async (event) => {
    const cell = event.target.closest(".cost-cell");
    if (cell) {
      selected = { days: Number(cell.dataset.days), style: cell.dataset.style };
      showDetail();
      return;
    }
    const stepper = event.target.closest("[data-travelers]");
    if (stepper) {
      travelers = Math.max(1, Math.min(20, Number(stepper.dataset.travelers)));
      const refreshed = await api(`/api/destinations/${encodeURIComponent(key)}?travelers=${travelers}`).catch(() => null);
      if (!refreshed) return;
      data.estimates = refreshed.estimates;
      costHost.innerHTML = costSection(destination, data.estimates);
      showDetail();
    }
  });
  showDetail();

  // Map (Leaflet needs the element in the DOM first)
  const map = createMap(container.querySelector("#places-map"), destination.center, 11);
  renderPlacesMap(map, destination);
  return () => destroyMap(map);
}
