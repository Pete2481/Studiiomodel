"use server";

/**
 * Weather Service using Open-Meteo API (Free for non-commercial use)
 * Provides sunrise, sunset, and daily weather conditions.
 */

import SunCalc from "suncalc";

export async function getWeatherData(lat: number, lon: number, startDate: string, endDate: string, timeZone?: string) {
  try {
    // Open-Meteo API endpoint for historical and forecast data
    // we use 'daily' for sunrise/sunset and weather code
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lon.toString());
    url.searchParams.set("start_date", startDate); // YYYY-MM-DD
    url.searchParams.set("end_date", endDate);     // YYYY-MM-DD
    url.searchParams.set("daily", "weather_code,sunrise,sunset");
    // Use tenant timezone if provided, otherwise fall back to Open-Meteo auto.
    url.searchParams.set("timezone", timeZone || "auto");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error("Weather data fetch failed");
    }

    const data = await response.json();
    return {
      success: true,
      daily: data.daily // contains time[], weather_code[], sunrise[], sunset[]
    };
  } catch (error: any) {
    console.error("WEATHER ERROR:", error);
    return { success: false, error: error.message };
  }
}

function zonedOpenMeteoLocalToUtcInstant(params: { ymdHm: string; timeZone: string }): Date | null {
  const { ymdHm, timeZone } = params;
  // Open-Meteo returns timezone-local timestamps without an explicit offset, e.g. "2026-01-17T05:49".
  // Parse them as *timeZone local time* and convert to a real UTC instant.
  const m = String(ymdHm).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
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
}

function listYmdDatesInclusive(params: { startDate: string; endDate: string }): string[] {
  const { startDate, endDate } = params;
  const m1 = String(startDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const m2 = String(endDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m1 || !m2) return [];
  const s = new Date(Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]), 12, 0, 0));
  const e = new Date(Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), 12, 0, 0));
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return [];
  const out: string[] = [];
  const cur = new Date(s.getTime());
  const endMs = e.getTime();
  while (cur.getTime() <= endMs) {
    const y = cur.getUTCFullYear();
    const mo = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${mo}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function sunCalcForDate(params: { date: string; timeZone: string; lat: number; lon: number }) {
  const { date, timeZone, lat, lon } = params;
  const noonUtc = zonedOpenMeteoLocalToUtcInstant({ ymdHm: `${date}T12:00`, timeZone });
  if (!noonUtc) return null;
  const times = SunCalc.getTimes(noonUtc, lat, lon);
  const sunrise = times?.sunrise instanceof Date ? times.sunrise : null;
  const sunset = times?.sunset instanceof Date ? times.sunset : null;
  if (!sunrise || !sunset || isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) return null;
  return { sunrise: sunrise.toISOString(), sunset: sunset.toISOString(), rawSunrise: sunrise.toISOString(), rawSunset: sunset.toISOString() };
}

/**
 * Resolve sunrise/sunset for a lat/lon over a date range, in a specific IANA timezone.
 * Returns real UTC instants (ISO strings) for sunrise/sunset per day.
 */
export async function getSunTimesForLatLonRange(params: {
  lat: number;
  lon: number;
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate: string; // YYYY-MM-DD (inclusive)
  timeZone: string; // IANA, e.g. Australia/Sydney
}): Promise<
  | { success: true; days: Array<{ date: string; sunrise: string; sunset: string; rawSunrise: string; rawSunset: string }> }
  | { success: false; error: string }
> {
  try {
    const lat = Number(params.lat);
    const lon = Number(params.lon);
    const startDate = String(params.startDate || "").trim();
    const endDate = String(params.endDate || "").trim();
    const timeZone = String(params.timeZone || "").trim() || "Australia/Sydney";
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { success: false, error: "Invalid lat/lon" };
    if (!startDate) return { success: false, error: "Missing startDate" };
    if (!endDate) return { success: false, error: "Missing endDate" };

    // Open-Meteo forecast often caps how far ahead it returns (commonly ~16 days).
    // We use it when available, but *fill missing days* with local SunCalc so we can support 4+ weeks reliably.
    const requestedDates = listYmdDatesInclusive({ startDate, endDate });
    const byDate = new Map<string, { sunrise: string; sunset: string; rawSunrise: string; rawSunset: string }>();

    const weather = await getWeatherData(lat, lon, startDate, endDate, timeZone);
    if (weather.success && weather.daily) {
      const dates: string[] = Array.isArray((weather as any).daily?.time) ? (weather as any).daily.time : [];
      const sunriseArr: string[] = Array.isArray((weather as any).daily?.sunrise) ? (weather as any).daily.sunrise : [];
      const sunsetArr: string[] = Array.isArray((weather as any).daily?.sunset) ? (weather as any).daily.sunset : [];
      const n = Math.max(dates.length, sunriseArr.length, sunsetArr.length);
      for (let i = 0; i < n; i++) {
        const date = String(dates[i] || "").trim();
        const rawSunrise = String(sunriseArr[i] || "").trim();
        const rawSunset = String(sunsetArr[i] || "").trim();
        if (!date || !rawSunrise || !rawSunset) continue;
        const sunriseDate = zonedOpenMeteoLocalToUtcInstant({ ymdHm: rawSunrise, timeZone });
        const sunsetDate = zonedOpenMeteoLocalToUtcInstant({ ymdHm: rawSunset, timeZone });
        if (!sunriseDate || !sunsetDate) continue;
        byDate.set(date, { sunrise: sunriseDate.toISOString(), sunset: sunsetDate.toISOString(), rawSunrise, rawSunset });
      }
    }

    const days: Array<{ date: string; sunrise: string; sunset: string; rawSunrise: string; rawSunset: string }> = [];
    for (const date of requestedDates) {
      const existing = byDate.get(date);
      if (existing) {
        days.push({ date, ...existing });
        continue;
      }
      const computed = sunCalcForDate({ date, timeZone, lat, lon });
      if (computed) {
        days.push({ date, ...computed });
      }
    }

    if (!days.length) return { success: false, error: "Failed to fetch sun times" };
    return { success: true, days };
  } catch (error: any) {
    console.error("SUN RANGE ERROR:", error);
    return { success: false, error: error.message || "Failed to fetch sun times" };
  }
}

/**
 * Resolve sunrise/sunset for a given address + date, in a specific IANA timezone.
 * Uses Google Geocoding (address -> lat/lon) and Open-Meteo (sunrise/sunset).
 */
export async function getSunTimesForAddress(params: {
  address: string;
  date: string; // YYYY-MM-DD
  timeZone: string; // IANA, e.g. Australia/Sydney
}): Promise<
  | { success: true; sunrise: string; sunset: string; rawSunrise: string; rawSunset: string }
  | { success: false; error: string }
> {
  try {
    const address = String(params.address || "").trim();
    const date = String(params.date || "").trim();
    const timeZone = String(params.timeZone || "").trim() || "Australia/Sydney";
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return { success: false, error: "Missing Google Maps API key" };
    if (!address) return { success: false, error: "Missing address" };
    if (!date) return { success: false, error: "Missing date" };

    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json().catch(() => ({}));
    if (geoData.status !== "OK" || !geoData.results?.[0]?.geometry?.location) {
      return { success: false, error: "Failed to geocode address" };
    }
    const { lat, lng } = geoData.results[0].geometry.location;

    const weather = await getWeatherData(lat, lng, date, date, timeZone);
    if (!weather.success || !weather.daily) return { success: false, error: "Failed to fetch sun times" };

    const rawSunrise = weather.daily.sunrise?.[0];
    const rawSunset = weather.daily.sunset?.[0];
    if (!rawSunrise || !rawSunset) return { success: false, error: "Missing sunrise/sunset data" };

    const sunriseDate = zonedOpenMeteoLocalToUtcInstant({ ymdHm: rawSunrise, timeZone });
    const sunsetDate = zonedOpenMeteoLocalToUtcInstant({ ymdHm: rawSunset, timeZone });
    if (!sunriseDate || !sunsetDate) return { success: false, error: "Failed to parse sunrise/sunset timestamps" };

    const sunrise = sunriseDate.toISOString();
    const sunset = sunsetDate.toISOString();

    return { success: true, sunrise, sunset, rawSunrise, rawSunset };
  } catch (error: any) {
    console.error("SUN TIMES ERROR:", error);
    return { success: false, error: error.message || "Failed to fetch sun times" };
  }
}

