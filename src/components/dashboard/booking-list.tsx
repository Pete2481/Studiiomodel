"use client";

import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_TOKENS = {
  confirmed: {
    surface: "bg-emerald-50 border-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-200",
    accent: "bg-primary",
  },
  requested: {
    surface: "bg-rose-50 border-rose-100",
    text: "text-rose-700",
    border: "border-rose-200",
    accent: "bg-rose-500",
  },
  pencilled: {
    surface: "bg-amber-50 border-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    accent: "bg-amber-500",
  },
  declined: {
    surface: "bg-rose-50 border-rose-100",
    text: "text-rose-700",
    border: "border-rose-200",
    accent: "bg-rose-500",
  },
  cancelled: {
    surface: "bg-slate-50 border-slate-100",
    text: "text-slate-500",
    border: "border-slate-200",
    accent: "bg-slate-400",
  },
  completed: {
    surface: "bg-purple-50 border-purple-100",
    text: "text-purple-700",
    border: "border-purple-200",
    accent: "bg-purple-500",
  },
  blocked: {
    surface: "bg-rose-100 border-rose-200",
    text: "text-rose-700",
    border: "border-rose-300",
    accent: "bg-rose-600",
  },
} as const;

export type BookingListBooking = {
  id: string;
  title: string;
  address: string;
  clientName: string;
  clientBusinessName?: string;
  serviceNames: string[];
  photographers: string;
  status: "confirmed" | "requested" | "pencilled" | "declined" | "cancelled" | "completed" | "blocked";
  startAt: string;
  endAt: string;
  notes?: string;
};

type BookingListProps = {
  bookings: BookingListBooking[];
  onEdit?: (booking: BookingListBooking) => void;
  hideHeaderActions?: boolean;
};

export function BookingList({
  bookings,
  onEdit,
  hideHeaderActions,
}: BookingListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const searchStr = `${booking.title} ${booking.address} ${booking.clientName} ${booking.clientBusinessName} ${booking.photographers}`.toLowerCase();
      return searchStr.includes(searchQuery.toLowerCase());
    });
  }, [bookings, searchQuery]);

  const sorted = useMemo(() => {
    return [...filteredBookings].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  }, [filteredBookings]);

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginatedBookings = sorted.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <section className="space-y-6 pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search bookings by address, client, or team..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="ui-input w-full pl-11"
          />
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm text-slate-600 border-collapse">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left">Date</th>
              <th className="px-6 py-4 text-left">Time</th>
              <th className="px-6 py-4 text-left">Client</th>
              <th className="px-6 py-4 text-left">Address</th>
              <th className="px-6 py-4 text-left">Services</th>
              <th className="px-6 py-4 text-left">Photographer</th>
              <th className="px-6 py-4 text-left">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedBookings.map((booking) => {
              const token = STATUS_TOKENS[booking.status] || STATUS_TOKENS.confirmed;

              return (
                <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">
                      {format(new Date(booking.startAt), "EEE d MMM")}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {format(new Date(booking.startAt), "yyyy")}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-700">
                      {format(new Date(booking.startAt), "h:mma")}
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 uppercase">
                      to {format(new Date(booking.endAt), "h:mma")}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">
                      {booking.clientBusinessName || "Client"}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {booking.clientName}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] font-medium text-slate-600 truncate max-w-[200px]">
                      {booking.address || "TBC"}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {booking.serviceNames.map((name, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] font-bold text-slate-700">
                      {booking.photographers || "To assign"}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${token.surface} ${token.text} ${token.border}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${token.accent}`} />
                      {booking.status === 'confirmed' ? 'Approved' : 
                       booking.status === 'pencilled' ? 'Pending' : 
                       booking.status === 'blocked' ? 'Time Block Out' :
                       booking.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {onEdit && (
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-4 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-emerald-500 hover:text-emerald-600 active:scale-95"
                        onClick={() => onEdit(booking)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

