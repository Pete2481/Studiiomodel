"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Loader2,
  Mail,
  Phone,
  User,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const [form, setForm] = useState({
    studioName: "",
    studioSlug: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",

    // Optional starter client
    createStarterClient: true,
    starterClientBusinessName: "",
    starterClientContactName: "",
    starterClientEmail: "",

    // Optional starter service
    createStarterService: true,
    starterServiceName: "Photography",
    starterServicePrice: "250",
    starterServiceDurationMinutes: "60",
  });

  const computedSlug = useMemo(() => slugify(form.studioName), [form.studioName]);
  const effectiveSlug = form.studioSlug.trim() ? form.studioSlug.trim() : computedSlug;

  const canNext = useMemo(() => {
    if (step === 1) return !!form.studioName.trim() && !!effectiveSlug;
    if (step === 2) return !!form.contactName.trim() && !!form.contactEmail.trim();
    return true;
  }, [step, form.studioName, form.contactName, form.contactEmail, effectiveSlug]);

  const next = () => {
    if (!canNext) return;
    setError(null);
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  };
  const back = () => {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: any = {
        name: form.studioName.trim(),
        slug: effectiveSlug,
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        starter: {},
      };

      if (form.createStarterClient) {
        payload.starter.client = {
          businessName: form.starterClientBusinessName.trim() || "My First Client",
          contactName: form.starterClientContactName.trim() || "Primary Contact",
          email: form.starterClientEmail.trim() || form.contactEmail.trim(),
        };
      }

      if (form.createStarterService) {
        payload.starter.service = {
          name: form.starterServiceName.trim() || "Standard Photography",
          price: Number(form.starterServicePrice || 0),
          durationMinutes: Number(form.starterServiceDurationMinutes || 0),
        };
      }

      const res = await fetch("/api/public/register-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create workspace.");

      setCreated(true);
      // Send them to login with email prefilled
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(form.contactEmail.trim())}&registered=1`);
      }, 700);
    } catch (e: any) {
      setError(e?.message || "Failed to create workspace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.35] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]" />
      <div className="absolute top-[-15%] left-[-5%] w-[55%] h-[55%] bg-emerald-100/30 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-15%] right-[-5%] w-[55%] h-[55%] bg-blue-100/30 rounded-full blur-[120px]" />

      <div className="w-full max-w-[980px] relative z-10">
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 uppercase tracking-widest transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back to login
          </Link>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">STUDIO SIGNUP</p>
        </div>

        <div className="bg-white rounded-[48px] border border-slate-200/60 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-10 md:p-12 border-b border-slate-100/70">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Create your workspace</h1>
                <p className="text-sm font-medium text-slate-500">
                  Set up your studio in minutes. Start on a <span className="font-bold text-slate-700">90‑day trial</span>.
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={cn(
                      "h-2 w-14 rounded-full transition-all",
                      step >= s ? "bg-emerald-500" : "bg-slate-100",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="p-10 md:p-12 space-y-10">
            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm font-bold">
                {error}
              </div>
            )}

            {created ? (
              <div className="py-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="h-20 w-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Workspace created</h2>
                  <p className="text-sm font-medium text-slate-500">
                    Redirecting you to login…
                  </p>
                </div>
              </div>
            ) : (
              <>
                {step === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-3">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">
                        Studio name
                      </label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                          <Building2 className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                          <div className="w-[1px] h-4 bg-slate-100" />
                        </div>
                        <input
                          required
                          value={form.studioName}
                          onChange={(e) => setForm((p) => ({ ...p, studioName: e.target.value }))}
                          placeholder="e.g. Studiio Sydney"
                          className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300"
                        />
                      </div>
                      <p className="text-[12px] text-slate-500 font-medium">
                        This is what your team will see as the workspace title.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">
                        Workspace URL slug
                      </label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                          <Globe className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                          <div className="w-[1px] h-4 bg-slate-100" />
                        </div>
                        <input
                          value={form.studioSlug}
                          onChange={(e) => setForm((p) => ({ ...p, studioSlug: e.target.value }))}
                          placeholder={computedSlug || "your-studio"}
                          className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300"
                        />
                      </div>
                      <p className="text-[12px] text-slate-500 font-medium">
                        Your public page link will be: <span className="font-bold text-slate-700">/book/{effectiveSlug || "…"}</span>
                      </p>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-3">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">
                        Primary admin name
                      </label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                          <User className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                          <div className="w-[1px] h-4 bg-slate-100" />
                        </div>
                        <input
                          required
                          value={form.contactName}
                          onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
                          placeholder="e.g. Peter Hogan"
                          className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">
                        Primary admin email
                      </label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                          <Mail className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                          <div className="w-[1px] h-4 bg-slate-100" />
                        </div>
                        <input
                          required
                          type="email"
                          value={form.contactEmail}
                          onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                          placeholder="admin@studio.com"
                          className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">
                        Phone (optional)
                      </label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                          <Phone className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                          <div className="w-[1px] h-4 bg-slate-100" />
                        </div>
                        <input
                          value={form.contactPhone}
                          onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                          placeholder="0400 000 000"
                          className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="rounded-[32px] border border-slate-100 bg-slate-50/40 p-8 space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Starter client</p>
                            <p className="text-lg font-black text-slate-900 tracking-tight">Add your first client</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, createStarterClient: !p.createStarterClient }))}
                            className={cn(
                              "h-10 px-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all border",
                              form.createStarterClient
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "bg-white text-slate-500 border-slate-200",
                            )}
                          >
                            {form.createStarterClient ? "Enabled" : "Skip"}
                          </button>
                        </div>

                        {form.createStarterClient && (
                          <div className="space-y-4">
                            <input
                              value={form.starterClientBusinessName}
                              onChange={(e) => setForm((p) => ({ ...p, starterClientBusinessName: e.target.value }))}
                              placeholder="Agency / Business name (e.g. Ray White)"
                              className="ui-input-tight text-sm"
                            />
                            <input
                              value={form.starterClientContactName}
                              onChange={(e) => setForm((p) => ({ ...p, starterClientContactName: e.target.value }))}
                              placeholder="Primary contact name"
                              className="ui-input-tight text-sm"
                            />
                            <input
                              value={form.starterClientEmail}
                              onChange={(e) => setForm((p) => ({ ...p, starterClientEmail: e.target.value }))}
                              placeholder="Client email"
                              className="ui-input-tight text-sm"
                            />
                          </div>
                        )}
                      </div>

                      <div className="rounded-[32px] border border-slate-100 bg-slate-50/40 p-8 space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Starter service</p>
                            <p className="text-lg font-black text-slate-900 tracking-tight">Add a custom service</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, createStarterService: !p.createStarterService }))}
                            className={cn(
                              "h-10 px-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all border",
                              form.createStarterService
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "bg-white text-slate-500 border-slate-200",
                            )}
                          >
                            {form.createStarterService ? "Skip" : "Add"}
                          </button>
                        </div>

                        {form.createStarterService && (
                          <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                              Service name
                            </p>
                            <div className="relative">
                              <Wrench className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                              <input
                                value={form.starterServiceName}
                                onChange={(e) => setForm((p) => ({ ...p, starterServiceName: e.target.value }))}
                                placeholder="Service name (e.g. Photography)"
                                className="ui-input-tight pl-11 text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                                  Price
                                </p>
                              <input
                                value={form.starterServicePrice}
                                onChange={(e) => setForm((p) => ({ ...p, starterServicePrice: e.target.value }))}
                                placeholder="e.g. 250"
                                inputMode="decimal"
                                className="ui-input-tight text-sm"
                              />
                              </div>
                              <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                                  Duration (mins)
                                </p>
                              <input
                                value={form.starterServiceDurationMinutes}
                                onChange={(e) => setForm((p) => ({ ...p, starterServiceDurationMinutes: e.target.value }))}
                                placeholder="e.g. 60"
                                inputMode="numeric"
                                className="ui-input-tight text-sm"
                              />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-100 bg-white p-6">
                      <p className="text-sm font-bold text-slate-700">
                        We’ll also auto-add standard services + edit tags so you can start working immediately.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        You can change everything later—this step just saves time on first login.
                      </p>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="rounded-[32px] border border-slate-100 bg-slate-50/40 p-8 space-y-6">
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Review</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Studio</p>
                          <p className="text-lg font-black text-slate-900">{form.studioName || "—"}</p>
                          <p className="text-xs text-slate-500 mt-1">Slug: <span className="font-bold text-slate-700">{effectiveSlug || "—"}</span></p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Primary admin</p>
                          <p className="text-lg font-black text-slate-900">{form.contactName || "—"}</p>
                          <p className="text-xs text-slate-500 mt-1">{form.contactEmail || "—"}</p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={submit}
                      disabled={loading}
                      className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-10 font-bold text-sm transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" /> Creating workspace…
                        </>
                      ) : (
                        <>
                          Create workspace <ArrowRight className="h-4.5 w-4.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {!created && (
            <div className="px-10 py-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={back}
                disabled={step === 1 || loading}
                className="h-12 px-6 rounded-2xl border border-slate-200 bg-white text-slate-600 font-bold hover:text-slate-900 transition-all disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={next}
                disabled={step === 4 || loading || !canNext}
                className="h-12 px-8 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all flex items-center gap-2 disabled:opacity-40"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

