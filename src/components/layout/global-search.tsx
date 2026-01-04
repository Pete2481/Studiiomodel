"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Calendar, 
  ImageIcon, 
  Receipt, 
  User, 
  Paintbrush,
  Loader2,
  X,
  ChevronRight
} from "lucide-react";
import { useRouter } from "next/navigation";
import { globalSearch, SearchResult } from "@/app/actions/global-search";
import { cn } from "@/lib/utils";

const IconMap = {
  booking: Calendar,
  gallery: ImageIcon,
  invoice: Receipt,
  client: User,
  editRequest: Paintbrush,
};

const LabelMap = {
  booking: "Booking",
  gallery: "Gallery",
  invoice: "Invoice",
  client: "Client",
  editRequest: "Edit Request",
};

export function GlobalSearch({ placeholder }: { placeholder: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

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
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsLoading(true);
        try {
          const searchResults = await globalSearch(query);
          setResults(searchResults);
          setIsOpen(true);
        } catch (error) {
          console.error("Search failed:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false);
    setQuery("");
    router.push(result.href);
  };

  return (
    <div ref={containerRef} className="relative group flex-1 max-w-md w-full">
      <div className="relative">
        {isLoading ? (
          <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--primary)] animate-spin" />
        ) : (
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[var(--primary)]" />
        )}
        <input 
          type="search" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          className="h-11 w-full rounded-full border border-slate-200 bg-white pl-11 pr-10 text-sm font-medium outline-none transition-all focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/5 shadow-sm"
        />
        {query && (
          <button 
            onClick={() => { setQuery(""); setResults([]); setIsOpen(false); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200 max-h-[400px] overflow-y-auto scrollbar-hide">
          {results.length > 0 ? (
            <div className="space-y-1 px-2">
              {results.map((result, idx) => {
                const Icon = IconMap[result.type];
                return (
                  <button
                    key={`${result.type}-${result.id}-${idx}`}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left group rounded-2xl"
                  >
                    <div className="h-10 w-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-[var(--primary)]/10 group-hover:text-[var(--primary)] transition-colors shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-bold text-slate-900 truncate">
                          {result.title}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                          {LabelMap[result.type]}
                        </span>
                      </div>
                      {result.subtitle && (
                        <p className="text-[11px] font-medium text-slate-400 truncate">
                          {result.subtitle}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[var(--primary)] group-hover:translate-x-0.5 transition-all" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-8 text-center space-y-2">
              <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto text-slate-300">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-900">No results found</p>
              <p className="text-xs font-medium text-slate-400">Try searching for something else</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

