import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a Dropbox or Google Drive URL to be directly embeddable in an img/video tag.
 */
export function formatDropboxUrl(url: string) {
  if (!url) return url;
  
  // Don't format internal proxy URLs
  if (url.startsWith("/api/")) return url;

  // DROPBOX
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

  // GOOGLE DRIVE
  if (url.includes("drive.google.com")) {
    // If it's a direct file link, convert to direct image link
    if (url.includes("/file/d/")) {
      const match = url.match(/\/d\/([^/]+)/);
      if (match && match[1]) {
        return `https://drive.google.com/uc?export=view&id=${match[1]}`;
      }
    }
    // If it's a folder link, it won't work as an image src
    // but we return it anyway so the browser/Next.js handles it or fails gracefully
  }

  return url;
}

/**
 * Cleans a Dropbox shared link for use with the Dropbox API.
 * Keeps necessary parameters like rlkey but removes dl=0 or raw=1.
 */
export function cleanDropboxLink(url: string) {
  if (!url) return "";
  try {
    // Handle cases where the URL might not have a protocol or is relative
    const absoluteUrl = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(absoluteUrl.replace("dl.dropboxusercontent.com", "www.dropbox.com").replace("dl.dropbox.com", "www.dropbox.com"));
    urlObj.searchParams.delete("dl");
    urlObj.searchParams.delete("raw");
    return urlObj.toString();
  } catch (e) {
    // If URL parsing fails, at least normalize the domain
    return url
      .replace("dl.dropboxusercontent.com", "www.dropbox.com")
      .replace("dl.dropbox.com", "www.dropbox.com")
      .replace(/[?&]dl=[^&]*/, '')
      .replace(/[?&]raw=[^&]*/, '');
  }
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

