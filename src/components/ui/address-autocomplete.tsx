"use client";

import React, { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  countryBias?: string; // e.g. "au"
  name?: string;
  required?: boolean;
}

declare global {
  interface Window {
    google: any;
  }
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Search address...",
  className,
  countryBias = "au",
  name,
  required,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState(value);
  const [userHasTyped, setUserHasTyped] = useState(false);
  const lastFetchedValue = useRef("");
  const [googleReady, setGoogleReady] = useState(false);
  const autocompleteService = useRef<any>(null);

  // Robust initialization
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const init = () => {
      if (window.google?.maps?.places) {
        autocompleteService.current = new window.google.maps.places.AutocompleteService();
        setGoogleReady(true);
      }
    };

    if (window.google?.maps?.places) {
      init();
      return;
    }

    // Check if script already exists
    const scriptId = "google-maps-places-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    // Poll for readiness if onload doesn't fire or script already exists
    const interval = setInterval(() => {
      if (window.google?.maps?.places) {
        init();
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (value !== inputValue) {
      // When parent sets a value (e.g. opening an existing booking), do NOT open suggestions.
      setInputValue(value);
      setUserHasTyped(false);
      setSuggestions([]);
      setIsOpen(false);
      lastFetchedValue.current = "";
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Only fetch/show suggestions after the user has typed in this field.
    if (!userHasTyped) return;
    if (inputValue.length < 3 || inputValue === lastFetchedValue.current) {
      if (inputValue.length < 3) {
        setSuggestions([]);
        setIsOpen(false);
      }
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      lastFetchedValue.current = inputValue;

      const fetchFallback = async () => {
        try {
          const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(inputValue)}&limit=5${countryBias === "au" ? "&bbox=113.0,-44.0,154.0,-10.0" : ""}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.features) {
            const formatted = data.features.map((f: any) => {
              const p = f.properties;
              const main = p.housenumber ? `${p.housenumber} ${p.street || p.name}` : (p.street || p.name);
              const secondary = [p.city || p.town || p.suburb, p.state, p.postcode].filter(Boolean).join(", ");
              return {
                id: Math.random().toString(),
                label: [main, secondary].filter(Boolean).join(", "),
                main,
                secondary,
                source: "osm"
              };
            });
            setSuggestions(formatted);
            setIsOpen(true);
          }
        } catch (e) {
          console.error("OSM Fallback Error", e);
        } finally {
          setIsLoading(false);
        }
      };

      if (googleReady && autocompleteService.current) {
        let finished = false;
        const timeout = setTimeout(() => {
          if (!finished) fetchFallback();
        }, 3000);

        try {
          autocompleteService.current.getPlacePredictions(
            { input: inputValue, componentRestrictions: { country: countryBias } },
            (predictions: any[], status: string) => {
              finished = true;
              clearTimeout(timeout);
              if (status === "OK" && predictions?.length > 0) {
                setSuggestions(predictions.map(p => ({
                  id: p.place_id,
                  label: p.description,
                  main: p.structured_formatting.main_text,
                  secondary: p.structured_formatting.secondary_text,
                  source: "google"
                })));
                setIsOpen(true);
                setIsLoading(false);
              } else {
                fetchFallback();
              }
            }
          );
          return;
        } catch (e) {
          fetchFallback();
          return;
        }
      }
      fetchFallback();
    }, 500);

    return () => clearTimeout(timer);
  }, [inputValue, countryBias, googleReady, userHasTyped]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          name={name}
          required={required}
          value={inputValue}
          onChange={(e) => {
            const next = e.target.value;
            setUserHasTyped(true);
            setInputValue(next);
            onChange(next);
          }}
          placeholder={placeholder}
          className={cn("w-full", className)}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          {inputValue && (
            <button
              type="button"
              onClick={() => {
                setUserHasTyped(false);
                setInputValue("");
                onChange("");
                setSuggestions([]);
                setIsOpen(false);
                lastFetchedValue.current = "";
              }}
              className="text-slate-300 hover:text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && inputValue.length >= 3 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[110] overflow-hidden">
          <div className="py-2 max-h-[300px] overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setUserHasTyped(false);
                  setInputValue(s.label);
                  onChange(s.label);
                  setIsOpen(false);
                  lastFetchedValue.current = "";
                }}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 group"
              >
                <div className="mt-0.5 h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-700 truncate">{s.main}</p>
                  {s.secondary && <p className="text-[10px] font-medium text-slate-400 truncate uppercase">{s.secondary}</p>}
                </div>
              </button>
            ))}
          </div>
          <div className="bg-slate-50/50 px-4 py-2 border-t border-slate-50">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center">
              Suggestions by {suggestions[0]?.source === "google" ? "Google Maps" : "OpenStreetMap"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
