"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Search, 
  X, 
  ChevronRight, 
  Loader2,
  Calendar,
  ImageIcon,
  Receipt,
  User,
  Paintbrush
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

interface MobileSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSearchModal({ isOpen, onClose }: MobileSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsLoading(true);
        try {
          const searchResults = await globalSearch(query);
          setResults(searchResults);
        } catch (error) {
          console.error("Search failed:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    onClose();
    setQuery("");
    
    // Map to mobile routes
    let href = result.href;
    if (result.type === "booking") href = `/mobile/calendar?bookingId=${result.id}`;
    if (result.type === "gallery") href = `/gallery/${result.id}`;
    if (result.type === "invoice") href = `/mobile/invoices?invoiceId=${result.id}`;
    if (result.type === "client") href = `/mobile/clients?clientId=${result.id}`;
    if (result.type === "editRequest") href = `/mobile/inbox?requestId=${result.id}`;

    router.push(href);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="shrink-0 px-6 pt-12 pb-4 flex items-center gap-4 border-b border-slate-50">
        <div className="relative flex-1">
          {isLoading ? (
            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
          ) : (
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          )}
          <input 
            ref={inputRef}
            type="search" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties, clients..."
            className="h-12 w-full rounded-2xl bg-slate-50 pl-12 pr-10 text-base font-bold text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {query && (
            <button 
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button 
          onClick={onClose}
          className="text-sm font-bold text-slate-500 active:scale-95 transition-all"
        >
          Cancel
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {query.length >= 2 ? (
          results.length > 0 ? (
            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Search Results</p>
              <div className="space-y-2">
                {results.map((result, idx) => {
                  const Icon = IconMap[result.type] || Search;
                  return (
                    <button
                      key={`${result.type}-${result.id}-${idx}`}
                      onClick={() => handleSelect(result)}
                      className="w-full flex items-center gap-4 p-4 bg-slate-50 rounded-[24px] text-left active:scale-[0.98] transition-all group"
                    >
                      <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors shrink-0">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-slate-900 truncate">
                            {result.title}
                          </span>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0 bg-white px-2 py-1 rounded-md border border-slate-100">
                            {LabelMap[result.type]}
                          </span>
                        </div>
                        {result.subtitle && (
                          <p className="text-xs font-medium text-slate-400 truncate mt-0.5">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : !isLoading ? (
            <div className="py-20 text-center space-y-4">
              <div className="h-20 w-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto text-slate-200">
                <Search className="h-10 w-10" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">No matches found</p>
                <p className="text-sm font-medium text-slate-400 px-10">We couldn't find anything matching "{query}"</p>
              </div>
            </div>
          ) : null
        ) : (
          <div className="py-20 text-center space-y-4 opacity-40">
            <div className="h-20 w-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto text-slate-200">
              <Search className="h-10 w-10" />
            </div>
            <p className="text-sm font-bold text-slate-400">Start typing to search...</p>
          </div>
        )}
      </div>
    </div>
  );
}

