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
  const lastFetchedValue = useRef("");

  // Update internal value when prop changes from outside
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
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
      try {
        // Photon API: https://photon.komoot.io/
        // Australia bounding box approx: 113.0,-44.0,154.0,-10.0
        let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(inputValue)}&limit=5`;
        
        if (countryBias === "au") {
          // Photon uses bbox as [minLon, minLat, maxLon, maxLat]
          url += `&bbox=113.0,-44.0,154.0,-10.0`;
        }

        const response = await fetch(url);
        const data = await response.json();
        
        if (data.features) {
          const formatted = data.features.map((f: any) => {
            const props = f.properties;
            
            // Format address parts nicely
            const addressParts = [];
            if (props.housenumber && props.street) {
              addressParts.push(`${props.housenumber} ${props.street}`);
            } else if (props.street) {
              addressParts.push(props.street);
            } else if (props.name) {
              addressParts.push(props.name);
            }

            const areaParts = [];
            if (props.city || props.town || props.suburb || props.district) {
              areaParts.push(props.city || props.town || props.suburb || props.district);
            }
            if (props.state) areaParts.push(props.state);
            if (props.postcode) areaParts.push(props.postcode);
            
            const mainLabel = addressParts.join(", ");
            const secondaryLabel = areaParts.join(", ");
            
            const fullLabel = [mainLabel, secondaryLabel].filter(Boolean).join(", ");
            
            return {
              id: (props.osm_id || Math.random()) + "-" + Math.random(),
              label: fullLabel,
              main: mainLabel,
              secondary: secondaryLabel,
              full: f
            };
          });
          setSuggestions(formatted);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Failed to fetch address suggestions:", error);
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inputValue, countryBias]);

  const handleSelect = (suggestion: any) => {
    setInputValue(suggestion.label);
    lastFetchedValue.current = suggestion.label;
    onChange(suggestion.label);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          name={name}
          required={required}
          value={inputValue}
          onChange={(e) => {
            const val = e.target.value;
            setInputValue(val);
            onChange(val);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
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
                setInputValue("");
                lastFetchedValue.current = "";
                onChange("");
                setSuggestions([]);
                setIsOpen(false);
              }}
              className="text-slate-300 hover:text-slate-500 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (inputValue.length >= 3) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[110] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="py-2 max-h-[300px] overflow-y-auto custom-scrollbar">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors group"
              >
                <div className="mt-0.5 h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-700 group-hover:text-slate-900 truncate">
                    {s.main}
                  </p>
                  {s.secondary && (
                    <p className="text-[10px] font-medium text-slate-400 truncate uppercase tracking-wider">
                      {s.secondary}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="bg-slate-50/50 px-4 py-2 border-t border-slate-50">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.1em]">Suggestions by OpenStreetMap</p>
          </div>
        </div>
      )}
    </div>
  );
}

