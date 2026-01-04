"use server";

/**
 * Weather Service using Open-Meteo API (Free for non-commercial use)
 * Provides sunrise, sunset, and daily weather conditions.
 */

export async function getWeatherData(lat: number, lon: number, startDate: string, endDate: string) {
  try {
    // Open-Meteo API endpoint for historical and forecast data
    // we use 'daily' for sunrise/sunset and weather code
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lon.toString());
    url.searchParams.set("start_date", startDate); // YYYY-MM-DD
    url.searchParams.set("end_date", endDate);     // YYYY-MM-DD
    url.searchParams.set("daily", "weather_code,sunrise,sunset");
    url.searchParams.set("timezone", "auto");

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

