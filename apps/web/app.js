const form = document.getElementById("trip-form");
const itinerary = document.getElementById("itinerary");
const errorBox = document.getElementById("error");
const submitButton = form.querySelector('button[type="submit"]');
const mapDestinationTitle = document.getElementById("map-destination-title");
const mapDestinationSummary = document.getElementById("map-destination-summary");
const mapRouteList = document.getElementById("map-route-list");
const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function splitInterests(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validatePayload(payload) {
  if (!payload.destination || payload.destination.length < 2) {
    return "Enter an Indian destination.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.endDate)) {
    return "Use valid start and end dates.";
  }

  if (payload.endDate < payload.startDate) {
    return "End date must be on or after start date.";
  }

  if (!Number.isFinite(payload.budgetInr) || payload.budgetInr <= 0) {
    return "Enter a budget greater than zero.";
  }

  if (payload.interests.length === 0) {
    return "Add at least one interest.";
  }

  if (!Number.isFinite(payload.travelers) || payload.travelers < 1) {
    return "Travelers must be at least 1.";
  }

  return null;
}

function renderRoutePreview(data) {
  const trip = data.itinerary;
  mapDestinationTitle.textContent = `${trip.destination} route preview`;
  mapDestinationSummary.textContent = `${trip.days.length} day trip · ${trip.summary}`;

  mapRouteList.innerHTML = trip.days
    .map(
      (day) => `
        <div class="route-card">
          <div class="route-card-head">
            <strong>Day ${escapeHtml(day.dayNumber)}</strong>
            <span>${escapeHtml(day.weather.condition)}</span>
          </div>
          <p>${escapeHtml(day.theme)}</p>
          <div class="route-stops">
            ${day.activities
              .map(
                (activity) => {
                  const placeLabel = activity.location?.name ? ` · ${escapeHtml(activity.location.name)}` : "";
                  return `<span>${escapeHtml(activity.time)} · ${escapeHtml(activity.title)}${placeLabel}</span>`;
                },
              )
              .join("")}
          </div>
        </div>
      `,
    )
    .join("");
}

function renderItinerary(data) {
  const trip = data.itinerary;
  renderRoutePreview(data);
  itinerary.classList.remove("empty-state");
  itinerary.innerHTML = `
    <div class="itinerary-stack">
      <header class="itinerary-summary">
        <div>
          <h2>${escapeHtml(trip.tripTitle)}</h2>
          <p>${escapeHtml(trip.summary)}</p>
        </div>
        <div class="budget-pill">₹${escapeHtml(rupeeFormatter.format(trip.budgetEstimateInr))} budget</div>
      </header>
      ${trip.days
        .map(
          (day) => `
            <article class="day-card">
              <div class="day-card-head">
                <div>
                  <span>Day ${escapeHtml(day.dayNumber)}</span>
                  <h3>${escapeHtml(day.theme)}</h3>
                </div>
                <div class="weather-pill">${escapeHtml(day.weather.condition)} · ${escapeHtml(day.weather.tempHighC)}° / ${escapeHtml(day.weather.tempLowC)}°</div>
              </div>
              <div class="activity-list">
                ${day.activities
                  .map(
                    (activity) => `
                      <div class="activity-row">
                        <div class="activity-time">${escapeHtml(activity.time)}</div>
                        <div class="activity-body">
                          <strong>${escapeHtml(activity.title)}</strong>
                          <span>${escapeHtml(activity.category)}</span>
                          ${activity.notes ? `<p>${escapeHtml(activity.notes)}</p>` : ""}
                        </div>
                        <div class="activity-cost">₹${escapeHtml(rupeeFormatter.format(activity.estCostInr))}</div>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");

  const formData = new FormData(form);
  const payload = {
    destination: String(formData.get("destination") ?? "").trim(),
    startDate: String(formData.get("startDate") ?? "").trim(),
    endDate: String(formData.get("endDate") ?? "").trim(),
    budgetInr: Number(formData.get("budgetInr") ?? 0),
    interests: splitInterests(String(formData.get("interests") ?? "")),
    pace: String(formData.get("pace") ?? "balanced"),
    travelers: Number(formData.get("travelers") ?? 1),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  const validationError = validatePayload(payload);
  if (validationError) {
    showError(validationError);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Generating trip...";

  try {
    const response = await fetch("/api/itineraries/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message ?? "Failed to generate itinerary.");
    }

    renderItinerary(data);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Something went wrong.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Generate itinerary";
  }
});

mapDestinationTitle.textContent = "Goa route preview";
mapDestinationSummary.textContent = "Generate an itinerary to see the route summary here.";
