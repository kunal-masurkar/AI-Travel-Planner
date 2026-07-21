type ProviderConfig = {
  placesProvider: string;
  routingProvider: string;
  geocodingProvider: string;
  geoapifyApiKeyConfigured: boolean;
};

export function getProviderConfig(): ProviderConfig {
  return {
    placesProvider: process.env.PLACES_PROVIDER ?? "geoapify",
    routingProvider: process.env.ROUTING_PROVIDER ?? "geoapify",
    geocodingProvider: process.env.GEOCODING_PROVIDER ?? "nominatim",
    geoapifyApiKeyConfigured: Boolean(process.env.GEOAPIFY_API_KEY?.trim()),
  };
}
