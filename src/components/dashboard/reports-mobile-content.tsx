"use client";

import React from "react";
import { ChartCard } from "@/components/dashboard/report-charts";
import { DollarSign, Target, Briefcase, Clock, TrendingUp, BarChart3, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";

type TrendPoint = {
  label: string;
  value: number;
};

type ReportsMobileContentProps = {
  stats: {
    totalThisMonth: number;
    revenueTotal: number;
    avgTurnaroundDays: number;
    completedJobsThisWeek: number;
    completedJobsThisMonth: number;
    monthlySalesDaily: TrendPoint[];
    weeklySalesDaily: TrendPoint[];
    yearlySalesMonthly: TrendPoint[];
    selectedMonth: string;
    selectedYear: string;
    selectedWeekStart: string;
    servicesBookedTop: TrendPoint[];
    weeklySalesTotal: number;
    monthlySalesTotal: number;
    yearlySalesTotal: number;
  };
};

export function ReportsMobileContent({ stats }: ReportsMobileContentProps) {
  const currencyPrefix = "$";

  return (
    <div className="space-y-10 px-6">
      {/* KPI Cards Grid - 2x2 on mobile */}
      <div className="grid grid-cols-2 gap-4">
        {/* Revenue Card */}
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revenue</p>
            <p className="text-xl font-black text-slate-900 mt-1">
              {currencyPrefix}{stats.totalThisMonth.toLocaleString()}
            </p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Selected Month</p>
          </div>
        </div>

        {/* Jobs Card */}
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jobs</p>
            <p className="text-xl font-black text-slate-900 mt-1">{stats.completedJobsThisMonth}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Monthly Output</p>
          </div>
        </div>

        {/* Efficiency Card */}
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efficiency</p>
            <p className="text-xl font-black text-slate-900 mt-1">{stats.avgTurnaroundDays}d</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Avg Turnaround</p>
          </div>
        </div>

        {/* Growth Card */}
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Annual</p>
            <p className="text-xl font-black text-slate-900 mt-1">
              {currencyPrefix}{(stats.revenueTotal / 1000).toFixed(1)}k
            </p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Yearly Paid</p>
          </div>
        </div>
      </div>

      {/* Main Insights Chart */}
      <div className="space-y-8">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sales Trends</h3>
        </div>

        <div className="space-y-6">
          <div className="mobile-chart-container">
            <ChartCard
              title="Weekly Pulse"
              description="Daily revenue performance this week"
              data={stats.weeklySalesDaily}
              accent="#10b981"
              variant="bar"
              prefix={currencyPrefix}
              headerRight={
                <div className="text-right">
                  <p className="text-lg font-black text-slate-900">{currencyPrefix}{stats.weeklySalesTotal.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
                </div>
              }
            />
          </div>

          <div className="mobile-chart-container">
            <ChartCard
              title="Annual Growth"
              description="Monthly performance across the year"
              data={stats.yearlySalesMonthly}
              accent="#0ea5e9"
              variant="bar"
              prefix={currencyPrefix}
              headerRight={
                <div className="text-right">
                  <p className="text-lg font-black text-slate-900">{currencyPrefix}{stats.yearlySalesTotal.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year Total</p>
                </div>
              }
            />
          </div>

          <div className="mobile-chart-container">
            <ChartCard
              title="Detailed Trend"
              description="Day-by-day revenue mapping"
              data={stats.monthlySalesDaily}
              accent="#6366f1"
              variant="area"
              prefix={currencyPrefix}
              headerRight={
                <div className="text-right">
                  <p className="text-lg font-black text-slate-900">{currencyPrefix}{stats.monthlySalesTotal.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Month Total</p>
                </div>
              }
            />
          </div>

          <div className="mobile-chart-container">
            <ChartCard
              title="Popular Services"
              description="Top booking volume by category"
              data={stats.servicesBookedTop}
              accent="#ec4899"
              variant="bar"
              suffix="x"
              headerRight={
                <div className="text-right">
                  <p className="text-lg font-black text-slate-900">{stats.servicesBookedTop.reduce((acc, s) => acc + s.value, 0)}x</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total units</p>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

