"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

export function PastBookingsRangeFilter(props: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="relative w-full sm:w-52">
      <select
        value={props.value}
        onChange={(e) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("rangeDays", String(Number(e.target.value) || 90));
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="w-full h-11 pl-4 pr-10 rounded-2xl bg-white border border-slate-200 text-[11px] font-black text-slate-700 uppercase tracking-widest focus:ring-2 focus:ring-emerald-500/20 outline-none appearance-none"
      >
        <option value={30}>Last 30 days</option>
        <option value={90}>Last 90 days</option>
        <option value={365}>Last 12 months</option>
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

