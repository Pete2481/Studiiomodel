"use client";

import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { AlertCircle, TrendingUp } from "lucide-react";

// Local type - no mock data dependency
type TrendPoint = {
  label: string;
  value: number;
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function DonutCard({ title, description, data, prefix = "$" }: { title: string, description?: string, data: TrendPoint[], prefix?: string }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <article className="flex h-full flex-col rounded-[32px] border border-slate-100 bg-white px-8 py-8 shadow-sm hover:border-primary/20 transition-all">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Insight</p>
        <h3 className="text-lg font-black text-slate-900 tracking-tight mt-1">{title}</h3>
        {description ? <p className="mt-1 text-xs font-medium text-slate-500">{description}</p> : null}
      </div>

      <div className="mt-8 flex flex-1 items-center justify-center gap-8">
        <div className="h-48 w-48 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                nameKey="label"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-lg z-50">
                        <p className="font-semibold text-slate-900">{payload[0].name}</p>
                        <p className="text-primary font-bold">{prefix}{payload[0].value.toLocaleString()}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
            <p className="text-xl font-black text-slate-900">{prefix}{total.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {data.map((item, index) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-700 leading-tight">{item.label}</span>
                <span className="text-[10px] font-medium text-slate-400">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function LeaderboardCard({ title, description, data }: { title: string, description?: string, data: any[] }) {
  return (
    <article className="flex h-full flex-col rounded-[32px] border border-slate-100 bg-white px-8 py-8 shadow-sm hover:border-primary/20 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Strategic</p>
          <h3 className="text-lg font-black text-slate-900 tracking-tight mt-1">{title}</h3>
          {description ? <p className="mt-1 text-xs font-medium text-slate-500">{description}</p> : null}
        </div>
        <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-8 space-y-1">
        <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50">
          <div className="col-span-6">Client / Agency</div>
          <div className="col-span-3 text-right">Volume</div>
          <div className="col-span-3 text-right">Revenue</div>
        </div>
        <div className="max-h-[320px] overflow-y-auto custom-scrollbar pr-2">
          {data.map((client, index) => (
            <div key={client.id} className="grid grid-cols-12 items-center px-4 py-4 hover:bg-slate-50 rounded-2xl transition-colors group">
              <div className="col-span-6 flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-400 group-hover:bg-white transition-colors">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{client.name}</p>
                  {client.isAtRisk && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <AlertCircle className="h-3 w-3 text-rose-500" />
                      <span className="text-[9px] font-black uppercase text-rose-500">Churn Risk</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="col-span-3 text-right">
                <span className="text-xs font-bold text-slate-600">{client.volume} jobs</span>
              </div>
              <div className="col-span-3 text-right">
                <span className="text-sm font-black text-primary">${client.revenue.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

type ChartCardProps = {
  title: string;
  description?: string;
  data: TrendPoint[];
  accent: string;
  variant?: "area" | "bar";
  prefix?: string;
  suffix?: string;
  headerRight?: React.ReactNode;
};

const CustomTooltip = ({
  active,
  payload,
  label,
  prefix,
  suffix,
}: {
  active?: boolean;
  payload?: any;
  label?: string;
  prefix?: string;
  suffix?: string;
}) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="text-slate-500">
        {`${prefix ?? ""}${payload[0].value?.toLocaleString()}${suffix ?? ""}`.trim()}
      </p>
    </div>
  );
};

export function ChartCard({ title, description, data, accent, variant = "area", prefix, suffix, headerRight }: ChartCardProps) {
  return (
    <article className="flex h-full flex-col justify-between rounded-[32px] border border-slate-100 bg-white px-8 py-8 shadow-sm hover:border-primary/20 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Insight</p>
          <h3 className="text-lg font-black text-slate-900 tracking-tight mt-1">{title}</h3>
          {description ? <p className="mt-1 text-xs font-medium text-slate-500">{description}</p> : null}
        </div>
        {headerRight ? (
          <div className="flex flex-none justify-end">{headerRight}</div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl transition-colors" style={{ background: `${accent}10` }}>
            <span className="text-lg" style={{ color: accent }}>
              ●
            </span>
          </div>
        )}
      </div>
      <div className="mt-8 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {variant === "area" ? (
            <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} width={40} />
              <Tooltip content={<CustomTooltip prefix={prefix} suffix={suffix} />} />
              <Area type="monotone" dataKey="value" stroke={accent} fill={`url(#gradient-${title})`} strokeWidth={3} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} width={40} />
              <Tooltip content={<CustomTooltip prefix={prefix} suffix={suffix} />} />
              <Bar dataKey="value" radius={[12, 12, 12, 12]} fill={accent} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </article>
  );
}

