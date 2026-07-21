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

  if (!process.env.SUPABASE_URL?.trim()) {
    warnings.push("SUPABASE_URL is missing; database features will stay disabled.");
  }

  if (!process.env.SUPABASE_ANON_KEY?.trim()) {
    warnings.push("SUPABASE_ANON_KEY is missing; database features will stay disabled.");
  }

  return {
    ok: warnings.length === 0,
    warnings,
  };
}
