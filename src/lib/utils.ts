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
  
  if (url.includes("dropbox.com") || url.includes("dropboxusercontent.com")) {
    let directUrl = url
      .replace("www.dropbox.com", "dl.dropboxusercontent.com")
      .replace("dl.dropbox.com", "dl.dropboxusercontent.com")
      .replace("dl=0", "raw=1");

    if (!directUrl.includes("?")) {
      directUrl += "?raw=1";
    } else if (!directUrl.includes("dl=") && !directUrl.includes("raw=")) {
      directUrl += "&raw=1";
    }
    return directUrl;
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

