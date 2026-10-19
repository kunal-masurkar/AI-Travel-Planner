import { getProviderConfig } from "./providers.js";

export type RuntimeEnvStatus = {
  ok: boolean;
  warnings: string[];
};

export function validateRuntimeEnv(): RuntimeEnvStatus {
  const warnings: string[] = [];
  const providers = getProviderConfig();

  if (!process.env.GEMINI_API_KEY?.trim()) {
    warnings.push("GEMINI_API_KEY is missing; AI generation will need a Gemini key before live orchestration is enabled.");
  }

  if (providers.placesProvider === "geoapify" && !providers.geoapifyApiKeyConfigured) {
    warnings.push("GEOAPIFY_API_KEY is missing while PLACES_PROVIDER is set to geoapify.");
  }

  if (providers.routingProvider === "geoapify" && !providers.geoapifyApiKeyConfigured) {
    warnings.push("GEOAPIFY_API_KEY is missing while ROUTING_PROVIDER is set to geoapify.");
  }

  if (!process.env.GOOGLE_CLIENT_ID?.trim()) {
    warnings.push("GOOGLE_CLIENT_ID is missing; Google sign-in is hidden (email/password accounts still work).");
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    warnings.push("RESEND_API_KEY is missing; transactional emails (welcome & password reset) are disabled.");
  }

  return {
    ok: warnings.length === 0,
    warnings,
  };
}
