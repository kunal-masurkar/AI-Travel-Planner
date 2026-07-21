import { useState } from "react";
import {
  generateTripRequestSchema,
  generateTripResponseSchema,
  type GenerateTripResponse,
} from "@ai-travel-planner/shared";

const defaultForm = {
  destination: "Kyoto, Japan",
  startDate: "2026-11-10",
  endDate: "2026-11-14",
  budgetUsd: 650,
  interests: "food, temples, neighborhoods",
  pace: "balanced",
  travelers: 1,
  notes: "Prefer a comfortable pace with one flexible evening.",
};

type FormState = typeof defaultForm;

function splitInterests(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function App() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [result, setResult] = useState<GenerateTripResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const request = generateTripRequestSchema.safeParse({
      destination: form.destination,
      startDate: form.startDate,
      endDate: form.endDate,
      budgetUsd: Number(form.budgetUsd),
      interests: splitInterests(form.interests),
      pace: form.pace,
      travelers: Number(form.travelers),
      notes: form.notes,
    });

    if (!request.success) {
      setError(request.error.issues[0]?.message ?? "Please check the form values.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/itineraries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.data),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Failed to generate itinerary.");
      }

      const data = generateTripResponseSchema.parse(await response.json());
      setResult(data);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />

      <main className="page">
        <section className="hero panel">
          <div className="hero-copy">
            <span className="eyebrow">AI Travel Planner</span>
            <h1>Design trips with structure now, live APIs next.</h1>
            <p>
              This scaffold already includes a branded frontend, a typed API contract, and a demo itinerary generator that can be swapped for live place and weather services later.
            </p>

            <div className="hero-pills">
              <span>React + Vite</span>
              <span>Express API</span>
              <span>Zod schemas</span>
              <span>Demo itinerary engine</span>
            </div>
          </div>

          <div className="hero-card">
            <div className="stat">
              <strong>3</strong>
              <span>layers already wired</span>
            </div>
            <div className="stat">
              <strong>1</strong>
              <span>shared contract for data shape</span>
            </div>
            <div className="stat">
              <strong>0</strong>
              <span>faux backend shortcuts in the UI</span>
            </div>
          </div>
        </section>

        <section className="layout">
          <form className="panel form-panel" onSubmit={handleSubmit}>
            <div className="section-heading">
              <span>Trip brief</span>
              <p>Enter a destination and preferences to generate a starter itinerary.</p>
            </div>

            <label>
              Destination
              <input
                value={form.destination}
                onChange={(event) => setForm({ ...form, destination: event.target.value })}
                placeholder="Kyoto, Japan"
              />
            </label>

            <div className="grid-2">
              <label>
                Start date
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                />
              </label>
            </div>

            <div className="grid-2">
              <label>
                Budget USD
                <input
                  type="number"
                  min="1"
                  value={form.budgetUsd}
                  onChange={(event) => setForm({ ...form, budgetUsd: Number(event.target.value) })}
                />
              </label>
              <label>
                Travelers
                <input
                  type="number"
                  min="1"
                  value={form.travelers}
                  onChange={(event) => setForm({ ...form, travelers: Number(event.target.value) })}
                />
              </label>
            </div>

            <label>
              Interests
              <input
                value={form.interests}
                onChange={(event) => setForm({ ...form, interests: event.target.value })}
                placeholder="food, temples, neighborhoods"
              />
            </label>

            <label>
              Pace
              <select value={form.pace} onChange={(event) => setForm({ ...form, pace: event.target.value })}>
                <option value="relaxed">Relaxed</option>
                <option value="balanced">Balanced</option>
                <option value="packed">Packed</option>
              </select>
            </label>

            <label>
              Notes
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Anything the planner should respect"
              />
            </label>

            {error ? <div className="alert">{error}</div> : null}

            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Generating trip..." : "Generate itinerary"}
            </button>
          </form>

          <section className="result-column">
            <div className="panel map-panel">
              <div className="section-heading">
                <span>Map placeholder</span>
                <p>Leaflet integration can plug into this slot once live POI data is wired in.</p>
              </div>
              <div className="map-stage">
                <div className="map-grid" />
                <div className="map-label">
                  <strong>Route canvas</strong>
                  <span>Prepared for markers, daily layers, and weather overlays.</span>
                </div>
              </div>
            </div>

            <div className="panel itinerary-panel">
              <div className="section-heading">
                <span>Generated itinerary</span>
                <p>The API response is validated before it reaches the UI.</p>
              </div>

              {result ? (
                <div className="itinerary-stack">
                  <header className="itinerary-summary">
                    <div>
                      <h2>{result.itinerary.tripTitle}</h2>
                      <p>{result.itinerary.summary}</p>
                    </div>
                    <div className="budget-pill">${result.itinerary.budgetEstimateUsd.toFixed(0)} budget</div>
                  </header>

                  {result.itinerary.days.map((day) => (
                    <article className="day-card" key={`${day.dayNumber}-${day.date}`}>
                      <div className="day-card-head">
                        <div>
                          <span>Day {day.dayNumber}</span>
                          <h3>{day.theme}</h3>
                        </div>
                        <div className="weather-pill">
                          {day.weather.condition} · {day.weather.tempHighC}° / {day.weather.tempLowC}°
                        </div>
                      </div>

                      <div className="activity-list">
                        {day.activities.map((activity) => (
                          <div className="activity-row" key={`${activity.time}-${activity.title}`}>
                            <div className="activity-time">{activity.time}</div>
                            <div className="activity-body">
                              <strong>{activity.title}</strong>
                              <span>{activity.category}</span>
                              {activity.notes ? <p>{activity.notes}</p> : null}
                            </div>
                            <div className="activity-cost">${activity.estCostUsd}</div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <h2>Your itinerary will appear here.</h2>
                  <p>Try the default Kyoto trip to see the full data flow from form to API to UI.</p>
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
