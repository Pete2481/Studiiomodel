
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
  type: "SUNRISE" | "DUSK",
  timeZone?: string
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
    const weather = await getWeatherData(lat, lng, dateStr, dateStr, timeZone);

    if (!weather.success || !weather.daily) return null;

    const sunTimeStr = type === "SUNRISE" ? weather.daily.sunrise[0] : weather.daily.sunset[0];
    // Open-Meteo returns timezone-local timestamps without explicit offset, so parse in the requested timezone when provided.
    const parseZoned = (ymdHm: string) => {
      if (!timeZone) return new Date(ymdHm);
      const m = String(ymdHm).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!m) return new Date(ymdHm);
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const hh = Number(m[4]);
      const mm = Number(m[5]);
      const utcGuess = new Date(Date.UTC(y, mo - 1, d, hh, mm, 0));
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(utcGuess);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
      const oy = get("year");
      const om = get("month");
      const od = get("day");
      const oh = get("hour");
      const omi = get("minute");
      const desiredAsUTC = Date.UTC(y, mo - 1, d, hh, mm, 0);
      const observedAsUTC = Date.UTC(oy, om - 1, od, oh, omi, 0);
      return new Date(utcGuess.getTime() + (desiredAsUTC - observedAsUTC));
    };

    const sunTime = parseZoned(sunTimeStr);

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

