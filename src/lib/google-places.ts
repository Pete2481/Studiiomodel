
import { getTenantPrisma } from "@/lib/tenant-guard";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function getNearbyLandmarks(address: string) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("Google Maps API Key missing for landmark search");
    return [];
  }

  try {
    // 1. Geocode the address to get lat/lng
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();

    if (geoData.status !== "OK" || !geoData.results[0]) {
      console.log("Geocoding failed for address:", address);
      return [];
    }

    const { lat, lng } = geoData.results[0].geometry.location;

    // 2. Search for nearby landmarks (beaches, parks, cafes, attractions)
    const types = ["park", "cafe", "tourist_attraction", "natural_feature"];
    const landmarks: string[] = [];

    // We'll search for each type to get a diverse list
    const searchPromises = types.map(async (type) => {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=2000&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.results || [];
    });

    const results = await Promise.all(searchPromises);
    const flatResults = results.flat();

    // 3. Deduplicate and format
    const uniqueNames = new Set<string>();
    flatResults.forEach((place: any) => {
      if (place.name && place.rating >= 4.0) { // Only high-rated places
        uniqueNames.add(place.name);
      }
    });

    return Array.from(uniqueNames).slice(0, 8); // Top 8 landmarks
  } catch (error) {
    console.error("Error fetching landmarks:", error);
    return [];
  }
}

