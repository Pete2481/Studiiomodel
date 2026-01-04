import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a Dropbox URL to be directly embeddable in an img/video tag.
 * Converts ?dl=0 to ?raw=1 or ?dl=1
 */
export function formatDropboxUrl(url: string) {
  if (!url) return url;
  if (url.includes("dropbox.com")) {
    // Handle both ?dl=0 and &dl=0
    if (url.includes("dl=0")) {
      return url.replace("dl=0", "raw=1");
    }
    // If no query string at all, add it
    if (!url.includes("?")) {
      return `${url}?raw=1`;
    }
    // If has query but no dl/raw parameter, append it
    if (!url.includes("dl=") && !url.includes("raw=")) {
      return `${url}&raw=1`;
    }
  }
  return url;
}

/**
 * Maps Open-Meteo weather codes to emoji icons or labels
 * https://open-meteo.com/en/docs
 */
export function getWeatherIcon(code: number) {
  if (code === 0) return "☀️"; // Clear sky
  if (code >= 1 && code <= 3) return "🌤️"; // Mainly clear, partly cloudy, and overcast
  if (code >= 45 && code <= 48) return "🌫️"; // Fog
  if (code >= 51 && code <= 55) return "🌦️"; // Drizzle
  if (code >= 61 && code <= 65) return "🌧️"; // Rain
  if (code >= 71 && code <= 77) return "❄️"; // Snow fall
  if (code >= 80 && code <= 82) return "🌦️"; // Rain showers
  if (code >= 95 && code <= 99) return "⛈️"; // Thunderstorm
  return "☁️";
}

