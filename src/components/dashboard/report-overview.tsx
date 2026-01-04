"use client";

import React, { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChartCard, DonutCard, LeaderboardCard } from "@/components/dashboard/report-charts";
import { ReportsActions } from "@/components/dashboard/reports-actions";
import { ChevronDown, Calendar, Target, Briefcase, Clock, DollarSign, Filter, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, subMonths } from "date-fns";

type TrendPoint = {
  label: string;
  value: number;
};

type ReportsOverviewProps = {
  tenantId: string;
  stats: {
    view: string;
    selectedDate: string;
    periodLabel: string;
    totalInPeriod: number;
    completedJobsInPeriod: number;
    revenueTotalAnnual: number;
    revenueTarget: number;
    outstandingBalance: number;
    monthlySalesDaily: TrendPoint[];
    weeklySalesDaily: TrendPoint[];
    yearlySalesMonthly: TrendPoint[];
    currencyPrefix: string;
    monthOptions: Array<{ value: string; label: string }>;
    yearOptions: Array<{ value: string; label: string }>;
    clientLeaderboard: any[];
    revenueMix: TrendPoint[];
    servicesBookedTop: TrendPoint[];
  };
};

export function ReportsOverview({ tenantId, stats }: ReportsOverviewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currencyPrefix = stats.currencyPrefix || "$";

  const updateQuery = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams?.toString() || "");
    Object.entries(patch).forEach(([k, v]) => next.set(k, v));
    router.push(`/tenant/reports?${next.toString()}`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Reports Header / Actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Global Filter Switcher */}
          <div className="flex items-center bg-white border border-slate-100 rounded-full p-1 shadow-sm">
            <button 
              onClick={() => updateQuery({ view: 'month' })}
              className={cn(
                "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                stats.view === 'month' ? "bg-primary text-white shadow-md" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Monthly
            </button>
            <button 
              onClick={() => updateQuery({ view: 'week' })}
              className={cn(
                "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                stats.view === 'week' ? "bg-primary text-white shadow-md" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Weekly
            </button>
          </div>

          <div className="relative">
            <select
              value={stats.selectedDate}
              onChange={(e) => updateQuery({ date: e.target.value })}
              className="appearance-none rounded-full border border-slate-100 bg-white pl-4 pr-10 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer h-[38px]"
            >
              {stats.view === 'month' ? (
                stats.monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))
              ) : (
                // Simple week options for current/past weeks
                [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                  const d = startOfWeek(new Date(), { weekStartsOn: 1 });
                  const start = new Date(d.getTime() - i * 7 * 24 * 60 * 60 * 1000);
                  const val = format(start, "yyyy-MM-dd");
                  return <option key={val} value={val}>Week of {format(start, "dd MMM")}</option>
                })
              )}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <Calendar className="h-3 w-3 text-primary" />
            Showing: {stats.periodLabel}
          </div>

          <button 
            onClick={() => router.push('/tenant/reports')}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 hover:text-primary hover:border-primary/30 transition-all shadow-sm active:scale-95 group"
            title="Reset Filters"
          >
            <RefreshCw className="h-3.5 w-3.5 group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>
        
        <ReportsActions tenantId={tenantId} />
      </div>

      {/* KPI Section */}
      <section className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {/* 1) PERIOD REVENUE */}
        <article className="ui-card space-y-4 hover:border-emerald-200 transition-all group">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/50">
              <DollarSign className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              {stats.view === 'month' ? 'Monthly' : 'Weekly'} Revenue
            </p>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {currencyPrefix}{stats.totalInPeriod.toLocaleString()}
            </span>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Billed in {stats.periodLabel}</p>
          </div>
        </article>

        {/* 2) COMPLETED JOBS */}
        <article className="ui-card space-y-4 hover:border-amber-200 transition-all group">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/50">
              <Briefcase className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Delivered Content</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{stats.completedJobsInPeriod}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Galleries</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              In {stats.periodLabel}
            </p>
          </div>
        </article>

        {/* 3) OUTSTANDING BALANCE */}
        <article className="ui-card space-y-4 hover:border-yellow-200 transition-all group relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-yellow-50 text-yellow-600 flex items-center justify-center border border-yellow-100/50">
                <Clock className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Outstanding Balance</p>
            </div>
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-[8px] font-black rounded-lg uppercase tracking-wider">
              Pending
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {currencyPrefix}{stats.outstandingBalance.toLocaleString()}
            </span>
          </div>
        </article>

        {/* 4) ANNUAL REVENUE (PAID) */}
        <article className="ui-card space-y-4 hover:border-emerald-200 transition-all group relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/50">
                <Target className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Annual Revenue (Paid)</p>
            </div>
            <span className="px-2 py-1 bg-slate-50 text-slate-400 border border-slate-100 text-[8px] font-black rounded-lg uppercase tracking-wider">
              {stats.selectedDate.split('-')[0]} Goal
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {currencyPrefix}{stats.revenueTotalAnnual.toLocaleString()}
            </span>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
              Target: {currencyPrefix}{stats.revenueTarget.toLocaleString()}
            </p>
          </div>
        </article>
      </section>

      {/* Charts Grid */}
      <section className="grid gap-8 lg:grid-cols-2">
        <ChartCard
          title="Weekly Sales Pulse"
          description="Daily revenue performance for the current week."
          data={stats.weeklySalesDaily}
          accent="#10b981"
          variant="bar"
          prefix={currencyPrefix}
        />

        <ChartCard
          title="Annual Growth"
          description="Monthly revenue totals across the fiscal year."
          data={stats.yearlySalesMonthly}
          accent="#0ea5e9"
          variant="bar"
          prefix={currencyPrefix}
        />

        <ChartCard
          title="Monthly Detailed Trend"
          description="Detailed day-by-day revenue mapping."
          data={stats.monthlySalesDaily}
          accent="#6366f1"
          variant="area"
          prefix={currencyPrefix}
        />

        <ChartCard
          title="Service Popularity"
          description="Top services by booking volume."
          data={stats.servicesBookedTop}
          accent="#ec4899"
          variant="bar"
          suffix="x"
        />
      </section>

      {/* Strategic Insights Section */}
      <section className="grid gap-8 lg:grid-cols-2">
        <LeaderboardCard 
          title="Client Gold Leaderboard"
          description="Your top 10 whales by revenue and project volume."
          data={stats.clientLeaderboard}
        />
        <DonutCard 
          title="Revenue Mix"
          description="Distribution of income across your service catalogue."
          data={stats.revenueMix}
          prefix={currencyPrefix}
        />
      </section>
    </div>
  );
}

