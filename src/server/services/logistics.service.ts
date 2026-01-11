
import { getWeatherData } from "@/app/actions/weather";
import { format, addMinutes, subMinutes } from "date-fns";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface TravelInfo {
  distanceText: string;
  distanceValue: number; // meters
  durationText: string;
  durationValue: number; // seconds
}

export async function calculateTravelTime(origin: string, destination: string): Promise<TravelInfo | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("Google Maps API Key missing for travel calculation");
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.rows[0]?.elements[0] || data.rows[0].elements[0].status !== "OK") {
      console.log("Distance Matrix failed for:", { origin, destination });
      return null;
    }

    const element = data.rows[0].elements[0];
    return {
      distanceText: element.distance.text,
      distanceValue: element.distance.value,
      durationText: element.duration.text,
      durationValue: element.duration.value,
    };
  } catch (error) {
    console.error("Error calculating travel time:", error);
    return null;
  }
}

export async function getIdealSunTime(
  address: string, 
  date: Date, 
  type: "SUNRISE" | "DUSK"
): Promise<{ time: Date; label: string } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    // 1. Geocode address to get lat/lng for sun data
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();

    if (geoData.status !== "OK" || !geoData.results[0]) return null;
    const { lat, lng } = geoData.results[0].geometry.location;

    // 2. Fetch sun data for that location
    const dateStr = format(date, "yyyy-MM-dd");
    const weather = await getWeatherData(lat, lng, dateStr, dateStr);

    if (!weather.success || !weather.daily) return null;

    const sunTimeStr = type === "SUNRISE" ? weather.daily.sunrise[0] : weather.daily.sunset[0];
    const sunTime = new Date(sunTimeStr);

    // 3. Apply arrival offset (20-30 mins before)
    // Dusk: 25 mins before sunset
    // Sunrise: 15 mins before sunrise (start of golden hour prep)
    const arrivalTime = type === "DUSK" 
      ? subMinutes(sunTime, 25) 
      : subMinutes(sunTime, 15);

    return {
      time: arrivalTime,
      label: type === "DUSK" ? "Sunset" : "Sunrise"
    };
  } catch (error) {
    console.error("Error getting ideal sun time:", error);
    return null;
  }
}

