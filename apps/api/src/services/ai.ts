import { GoogleGenAI } from "@google/genai";
import type { Itinerary, TravelPreferences } from "@ai-travel-planner/shared";

function getClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

export interface AiPersonalizationResult {
  aiTips: string[];
  personalizedSummary?: string;
  notesAdvice?: string;
}

/**
 * Enriches an itinerary using Gemini AI based on destination, season, and traveller notes
 * (e.g., dietary restrictions, toddlers, accessibility, specific interests).
 */
export async function personalizeItineraryWithAi(
  itinerary: Itinerary,
  preferences?: TravelPreferences
): Promise<AiPersonalizationResult> {
  const aiClient = getClient();
  const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

  if (!aiClient) {
    return {
      aiTips: [
        "Carry light layers and comfortable walking shoes for heritage monuments.",
        "Early morning visits help beat the midday heat and tourist crowds.",
        "Keep digital copies of photo IDs and hotel reservations handy.",
      ],
    };
  }

  const notes = preferences?.notes?.trim();
  const interests = preferences?.interests?.join(", ") || itinerary.interests.join(", ");
  const dayHighlights = itinerary.days
    .map((day) => `Day ${day.dayNumber}: ${day.theme} (${day.activities.map((a) => a.title).join(", ")})`)
    .slice(0, 5)
    .join("\n");

  const prompt = `You are an elite, local travel expert for India.
Destination: ${itinerary.destination}
Duration: ${itinerary.days.length} days (${itinerary.startDate} to ${itinerary.endDate})
Travel Style: ${itinerary.travelStyle}, Pace: ${itinerary.pace}, Travelers: ${itinerary.travelers}
Interests: ${interests}
User Custom Notes/Requests: "${notes || "None provided"}"

Key highlights planned:
${dayHighlights}

Task:
Respond ONLY with a valid JSON object (no markdown code blocks, just raw JSON) matching this structure:
{
  "aiTips": [
    "3 to 5 highly specific, contextual insider tips directly addressing their notes (e.g. food advice if vegetarian, pacing advice if with toddlers/seniors, photography spots, hidden gems)"
  ],
  "personalizedSummary": "A warm, concise 2-sentence trip summary reflecting their custom requests and travel style.",
  "notesAdvice": "A brief 1-sentence reassurance on how their notes were incorporated."
}`;

  try {
    const response = await aiClient.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const raw = response.text?.trim();
    if (!raw) throw new Error("Empty response from Gemini");

    // Clean any accidental markdown fence if present
    const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      aiTips: Array.isArray(parsed.aiTips) && parsed.aiTips.length > 0 ? parsed.aiTips : [
        "Explore early mornings to enjoy serene monuments before crowds gather.",
        "Ask locals for fresh daily street specialties near the city center.",
      ],
      personalizedSummary: typeof parsed.personalizedSummary === "string" ? parsed.personalizedSummary : undefined,
      notesAdvice: typeof parsed.notesAdvice === "string" ? parsed.notesAdvice : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AI] Gemini enrichment failed (model: ${modelName}):`, msg);

    // Fallback tips tailored to notes keywords
    const fallbackTips: string[] = [];
    const lowerNotes = (notes || "").toLowerCase();

    if (lowerNotes.includes("veg") || lowerNotes.includes("jain")) {
      fallbackTips.push("Pure vegetarian and Jain dining options are widely available near major temples and central markets.");
    }
    if (lowerNotes.includes("kid") || lowerNotes.includes("child") || lowerNotes.includes("toddler") || lowerNotes.includes("baby")) {
      fallbackTips.push("Keep hydration packs handy and plan mid-afternoon breaks at shaded heritage gardens.");
    }
    if (lowerNotes.includes("senior") || lowerNotes.includes("elderly") || lowerNotes.includes("wheelchair")) {
      fallbackTips.push("Most prominent monuments have battery-operated golf carts and wheelchair ramps at the main gates.");
    }
    fallbackTips.push(`Early morning entry is recommended for ${itinerary.destination} to skip queues.`);
    fallbackTips.push("Use app-based cabs or pre-negotiated auto-rickshaws for smooth local transit.");

    return {
      aiTips: fallbackTips.slice(0, 4),
    };
  }
}
