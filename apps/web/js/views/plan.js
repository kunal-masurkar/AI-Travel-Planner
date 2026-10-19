import { api } from "../api.js";
import { clearDraft, findCuratedKey, loadDraft, recordRecent, state } from "../state.js";
import { addDays, debounce, escapeHtml, formatDateRange, inr, showLoader, styleLabels, todayIso, toast } from "../ui.js";
import { mountTrip } from "./trip.js";

const interestOptions = [
  ["history", "🏰 History & heritage"],
  ["culture", "🎭 Culture"],
  ["food", "🍲 Food"],
  ["nature", "🌿 Nature"],
  ["beaches", "🏖️ Beaches"],
  ["adventure", "🧗 Adventure"],
  ["shopping", "🛍️ Shopping"],
  ["relaxation", "🧘 Relaxation"],
  ["spiritual", "🕉️ Spiritual"],
  ["nightlife", "🌙 Nightlife"],
];

function defaultStart() {
  return addDays(todayIso(), 30);
}

function formHtml(values) {
  const destinationOptions = state.destinations.map((destination) => `<option value="${escapeHtml(destination.name)}"></option>`).join("");
  const days = values.days;
  return `
    <form class="card-panel form-panel" id="trip-form" novalidate>
      <div class="panel-header">
        <div class="panel-icon">📝</div>
        <div><h2>Your trip brief</h2><p>Tell us where, when and how you like to travel.</p></div>
      </div>

      <div class="form-grid">
        <div class="form-group span-2">
          <label for="dest-input" class="field-label">Destination in India <span class="required-star">*</span></label>
          <div class="input-with-icon">
            <span class="input-icon">📍</span>
            <input id="dest-input" name="destination" list="plan-destinations" value="${escapeHtml(values.destination)}" placeholder="e.g. Goa, Jaipur, Kerala, Shillong…" autocomplete="off" required />
          </div>
          <datalist id="plan-destinations">${destinationOptions}</datalist>
        </div>

        <div class="form-group">
          <label for="start-date-input" class="field-label">Start date</label>
          <input type="date" id="start-date-input" name="startDate" value="${values.startDate}" min="${todayIso()}" required />
        </div>

        <div class="form-group">
          <span class="field-label" id="duration-label">Trip length</span>
          <div class="segmented" role="group" aria-labelledby="duration-label">
            ${[3, 4, 5, 7].map((option) => `<button type="button" class="seg ${option === days ? "active" : ""}" data-days="${option}">${option}d</button>`).join("")}
            <select id="days-select" aria-label="Other length">
              ${Array.from({ length: 14 }, (_unused, index) => index + 1)
                .map((option) => `<option value="${option}" ${option === days ? "selected" : ""}>${option} day${option === 1 ? "" : "s"}</option>`)
                .join("")}
            </select>
          </div>
          <span class="muted small" id="date-range-hint">${escapeHtml(formatDateRange(values.startDate, addDays(values.startDate, days - 1)))}</span>
        </div>

        <div class="form-group">
          <span class="field-label" id="travelers-label">Travellers</span>
          <div class="stepper-control" role="group" aria-labelledby="travelers-label">
            <button type="button" class="btn-stepper" data-step="-1" aria-label="Fewer travellers">−</button>
            <span id="traveler-count-display">${values.travelers} ${values.travelers === 1 ? "person" : "people"}</span>
            <button type="button" class="btn-stepper" data-step="1" aria-label="More travellers">+</button>
          </div>
        </div>

        <div class="form-group">
          <label for="budget-input" class="field-label">Total budget (₹, optional)</label>
          <div class="input-with-icon">
            <span class="input-icon">₹</span>
            <input type="number" id="budget-input" name="budgetInr" min="1000" step="500" value="${values.budgetInr ?? ""}" placeholder="e.g. 40000" />
          </div>
        </div>

        <div class="form-group span-2">
          <span class="field-label" id="style-label">Travel style</span>
          <div class="pace-selector" role="radiogroup" aria-labelledby="style-label">
            ${[
              ["budget", "🎒", "Budget", "Hostels, local eats, buses"],
              ["mid", "🧳", "Mid-range", "Comfort hotels, cabs"],
              ["premium", "💎", "Premium", "Luxury stays, private car"],
            ]
              .map(
                ([value, emoji, title, sub]) => `<label class="pace-card ${values.travelStyle === value ? "active" : ""}">
                  <input type="radio" name="travelStyle" value="${value}" ${values.travelStyle === value ? "checked" : ""} />
                  <div class="pace-card-inner"><span class="pace-emoji">${emoji}</span><span class="pace-title">${title}</span><span class="pace-sub">${sub}</span></div>
                </label>`,
              )
              .join("")}
          </div>
        </div>

        <div class="form-group">
          <label for="accommodation-input" class="field-label">Accommodation</label>
          <select id="accommodation-input" name="accommodationType">
            ${[
              ["any", "Any type"],
              ["hotel", "Hotels"],
              ["resort", "Resorts"],
              ["homestay", "Homestays"],
              ["hostel", "Hostels"],
            ]
              .map(([value, label]) => `<option value="${value}" ${values.accommodationType === value ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
        </div>

        <div class="form-group span-3">
          <span class="field-label" id="interests-label">Interests</span>
          <div class="interest-chips" role="group" aria-labelledby="interests-label">
            ${interestOptions
              .map(([value, label]) => `<button type="button" class="chip ${values.interests.includes(value) ? "active" : ""}" data-interest="${value}" aria-pressed="${values.interests.includes(value)}">${label}</button>`)
              .join("")}
          </div>
        </div>

        <div class="form-group span-2">
          <span class="field-label" id="pace-label">Pace</span>
          <div class="pace-selector" role="radiogroup" aria-labelledby="pace-label">
            ${[
              ["relaxed", "☕", "Relaxed", "2–3 stops/day"],
              ["balanced", "⚖️", "Balanced", "3–4 stops/day"],
              ["packed", "⚡", "Packed", "5+ stops/day"],
            ]
              .map(
                ([value, emoji, title, sub]) => `<label class="pace-card ${values.pace === value ? "active" : ""}">
                  <input type="radio" name="pace" value="${value}" ${values.pace === value ? "checked" : ""} />
                  <div class="pace-card-inner"><span class="pace-emoji">${emoji}</span><span class="pace-title">${title}</span><span class="pace-sub">${sub}</span></div>
                </label>`,
              )
              .join("")}
          </div>
        </div>

        <div class="form-group">
          <label for="notes-input" class="field-label">Notes</label>
          <textarea id="notes-input" rows="3" name="notes" maxlength="1000" placeholder="e.g. vegetarian, travelling with kids">${escapeHtml(values.notes ?? "")}</textarea>
        </div>
      </div>

      <div id="duration-compare" class="duration-compare" aria-live="polite"></div>

      <div id="error" class="alert-box" role="alert" hidden></div>
      <button class="primary-cta-button" type="submit" id="submit-btn"><span>✨</span><span>Generate itinerary</span></button>
      ${state.user ? `<p class="muted small center">Plans are saved to your account automatically.</p>` : `<p class="muted small center">Log in to save plans to your account.</p>`}
    </form>`;
}

export async function renderPlan(container, params) {
  const draft = !params.get("destination") ? loadDraft() : null;
  const stored = draft?.preferences ?? {};
  const values = {
    destination: params.get("destination") ?? stored.destination ?? "",
    startDate: stored.startDate && stored.startDate >= todayIso() ? stored.startDate : defaultStart(),
    days: Number(params.get("days")) || (stored.startDate ? Math.round((Date.parse(stored.endDate) - Date.parse(stored.startDate)) / 86_400_000) + 1 : 4),
    travelers: Number(params.get("travelers")) || stored.travelers || 2,
    budgetInr: stored.budgetInr ?? null,
    travelStyle: params.get("style") ?? stored.travelStyle ?? "mid",
    accommodationType: stored.accommodationType ?? "any",
    interests: stored.interests ?? ["history", "food", "culture"],
    pace: stored.pace ?? "balanced",
    notes: stored.notes ?? "",
  };

  container.innerHTML = `
    <section class="page-intro">
      <h1>Plan a trip</h1>
      <p>Generate a day-by-day plan with routes, meals, stays and a full cost estimate — then fine-tune it.</p>
    </section>
    <div id="plan-form-host">${formHtml(values)}</div>
    <div id="plan-results" class="plan-results"></div>`;

  const form = container.querySelector("#trip-form");
  const results = container.querySelector("#plan-results");
  let tripHandle = null;

  const setError = (message) => {
    const box = form.querySelector("#error");
    box.textContent = message;
    box.hidden = !message;
  };

  const updateDateHint = () => {
    form.querySelector("#date-range-hint").textContent = formatDateRange(values.startDate, addDays(values.startDate, values.days - 1));
  };

  const refreshComparison = debounce(async () => {
    const host = form.querySelector("#duration-compare");
    const key = findCuratedKey(values.destination);
    if (!key) {
      host.innerHTML = "";
      return;
    }
    const data = await api(`/api/destinations/${key}?travelers=${values.travelers}&startDate=${values.startDate}`).catch(() => null);
    if (!data || !host.isConnected) return;
    host.innerHTML = `
      <span class="field-label">Compare trip lengths · ${escapeHtml(data.destination.name)} · ${styleLabels[values.travelStyle]} · ${values.travelers} traveller${values.travelers === 1 ? "" : "s"}</span>
      <div class="compare-grid">
        ${data.estimates.durations
          .map((row) => {
            const cost = row.styles[values.travelStyle];
            return `<button type="button" class="compare-card ${row.days === values.days ? "active" : ""}" data-compare-days="${row.days}">
              <strong>${row.days} days</strong>
              <span class="compare-total">${inr(cost.total)}</span>
              <span class="muted small">${inr(cost.perPerson)} pp</span>
            </button>`;
          })
          .join("")}
      </div>`;
  }, 300);

  form.addEventListener("click", (event) => {
    const segment = event.target.closest("[data-days]");
    if (segment) {
      values.days = Number(segment.dataset.days);
      form.querySelectorAll(".seg").forEach((button) => button.classList.toggle("active", button === segment));
      form.querySelector("#days-select").value = String(values.days);
      updateDateHint();
      refreshComparison();
      return;
    }
    const compare = event.target.closest("[data-compare-days]");
    if (compare) {
      values.days = Number(compare.dataset.compareDays);
      form.querySelectorAll(".seg").forEach((button) => button.classList.toggle("active", Number(button.dataset.days) === values.days));
      form.querySelector("#days-select").value = String(values.days);
      updateDateHint();
      form.requestSubmit();
      return;
    }
    const step = event.target.closest("[data-step]");
    if (step) {
      values.travelers = Math.max(1, Math.min(20, values.travelers + Number(step.dataset.step)));
      form.querySelector("#traveler-count-display").textContent = `${values.travelers} ${values.travelers === 1 ? "person" : "people"}`;
      refreshComparison();
      return;
    }
    const chip = event.target.closest("[data-interest]");
    if (chip) {
      chip.classList.toggle("active");
      chip.setAttribute("aria-pressed", String(chip.classList.contains("active")));
      values.interests = [...form.querySelectorAll("[data-interest].active")].map((element) => element.dataset.interest);
    }
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target.name === "travelStyle" || target.name === "pace") {
      values[target.name] = target.value;
      target.closest(".pace-selector").querySelectorAll(".pace-card").forEach((card) => card.classList.toggle("active", card.contains(target)));
      refreshComparison();
    }
    if (target.id === "days-select") {
      values.days = Number(target.value);
      form.querySelectorAll(".seg").forEach((button) => button.classList.toggle("active", Number(button.dataset.days) === values.days));
      updateDateHint();
      refreshComparison();
    }
    if (target.id === "start-date-input" && target.value) {
      values.startDate = target.value;
      updateDateHint();
      refreshComparison();
    }
    if (target.id === "accommodation-input") values.accommodationType = target.value;
  });

  form.querySelector("#dest-input").addEventListener("input", (event) => {
    values.destination = event.target.value;
    refreshComparison();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");
    values.destination = form.querySelector("#dest-input").value.trim();
    const budgetValue = Number(form.querySelector("#budget-input").value);
    values.budgetInr = budgetValue > 0 ? budgetValue : null;
    values.notes = form.querySelector("#notes-input").value.trim();

    if (values.destination.length < 2) return setError("Please enter a destination in India (e.g. Goa, Jaipur).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate)) return setError("Please choose a valid start date.");
    if (values.interests.length === 0) return setError("Pick at least one interest so we can tailor the plan.");

    const payload = {
      destination: values.destination,
      startDate: values.startDate,
      endDate: addDays(values.startDate, values.days - 1),
      interests: values.interests,
      pace: values.pace,
      travelers: values.travelers,
      travelStyle: values.travelStyle,
      accommodationType: values.accommodationType,
      ...(values.budgetInr ? { budgetInr: values.budgetInr } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };

    const submit = form.querySelector("#submit-btn");
    submit.disabled = true;
    const hide = showLoader(`Crafting your ${values.destination} itinerary`, [
      "Finding places that match your interests…",
      "Checking the weather for your dates…",
      "Grouping nearby stops to cut travel time…",
      "Picking restaurants and stays…",
      "Estimating costs in ₹…",
    ]);
    try {
      const result = await api("/api/itineraries/generate", { method: "POST", body: payload });
      recordRecent(result.itinerary.destination, result.itinerary.destinationKey);
      if (result.savedTripId) {
        clearDraft();
        toast("Itinerary saved to your trips", "success");
        location.hash = `#/trip/${result.savedTripId}`;
        return;
      }
      tripHandle?.destroy();
      tripHandle = mountTrip(results, { itinerary: result.itinerary, preferences: payload });
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setError(error.message);
    } finally {
      hide();
      submit.disabled = false;
    }
  });

  refreshComparison();

  // Restore an unsaved guest plan so a refresh doesn't lose work.
  if (draft?.itinerary) {
    tripHandle = mountTrip(results, { itinerary: draft.itinerary, preferences: draft.preferences, title: draft.title });
  }

  return () => tripHandle?.destroy();
}
