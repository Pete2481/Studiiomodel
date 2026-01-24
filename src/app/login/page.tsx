"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { 
  ShieldCheck, 
  Mail, 
  ArrowRight, 
  Building2, 
  Lock, 
  ChevronRight,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Command,
  Globe,
  Zap
} from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { formatDropboxUrl } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { CameraLoader } from "@/components/ui/camera-loader";

type LoginStep = "EMAIL" | "TENANT_SELECT" | "OTP";

interface TenantOption {
  id: string;
  tenantId?: string;
  name: string;
  slug: string;
  logoUrl?: string;
  role: string;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<LoginStep>("EMAIL");
  const [email, setEmail] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedLogos, setFailedLogos] = useState<Record<string, true>>({});
  const pointerSelectedTenantIdRef = useRef<string | null>(null);
  const didAutoLoginRef = useRef(false);

  // Prefill email after registration (or any deep-link).
  useEffect(() => {
    const prefill = String(searchParams.get("email") || "").trim();
    if (prefill && !email) setEmail(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-login support (Approve link): /login?autologin=1&email=...&tenantId=...&otp=......
  useEffect(() => {
    if (didAutoLoginRef.current) return;
    const autologin = String(searchParams.get("autologin") || "") === "1";
    if (!autologin) return;

    const e = String(searchParams.get("email") || "").trim();
    const t = String(searchParams.get("tenantId") || "").trim();
    const code = String(searchParams.get("otp") || "").trim();
    if (!e || !t || !code) return;
    if (!/^\d{6}$/.test(code)) return;

    didAutoLoginRef.current = true;
    setError(null);
    setEmail(e);
    setSelectedTenant({ id: t, name: "Workspace", slug: "", role: "TENANT_ADMIN" });
    setStep("OTP");
    setOtp(code.split(""));

    setLoading(true);
    void (async () => {
      try {
        const result = await signIn("credentials", {
          email: e,
          tenantId: t,
          otp: code,
          redirect: false,
        });
        if (result?.error) throw new Error("This Approve link has expired or was already used. Please request a new code.");
        window.location.href = "/";
      } catch (err: any) {
        setError(err?.message || "Auto-login failed. Please log in normally.");
        setLoading(false);
        setStep("EMAIL");
        setSelectedTenant(null);
        setOtp(["", "", "", "", "", ""]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/tenant-lookup", {
        method: "POST",
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to lookup user");

      if (data.tenants.length === 0) {
        setError("No professional account found with this email.");
        setLoading(false);
        return;
      }

      setTenants(data.tenants);

      if (data.tenants.length > 1) {
        setStep("TENANT_SELECT");
      } else {
        const tenant = data.tenants[0];
        setSelectedTenant(tenant);
        await sendOtp(email, tenant.id);
        setStep("OTP");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (targetEmail: string, tenantId: string) => {
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email: targetEmail, tenantId }),
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Verification service error. Please try again.");
    }
  };

  const handleTenantSelect = async (tenant: TenantOption) => {
    setLoading(true);
    setError(null);
    try {
      setSelectedTenant(tenant);
      await sendOtp(email, tenant.id);
      setStep("OTP");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    // Handle single character input
    if (isNaN(Number(value)) && value !== "") return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = [...otp];
    pastedData.split("").forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);

    // Focus last filled or next empty
    const lastIndex = Math.min(pastedData.length - 1, 5);
    otpRefs.current[lastIndex]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length < 6) return;

    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email,
        tenantId: selectedTenant?.id,
        otp: code,
        redirect: false,
      });

      if (result?.error) {
        throw new Error("Incorrect verification code.");
      }

      if (selectedTenant?.id === "MASTER") {
        window.location.href = "/master/tenants";
      } else {
        window.location.href = "/";
      }
    } catch (err: any) {
      setError(err.message);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {loading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6">
            <CameraLoader size="md" color="var(--primary)" className="text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 animate-pulse">
              {step === "TENANT_SELECT" ? "Sending code…" : step === "OTP" ? "Authorizing…" : "Loading…"}
            </p>
          </div>
        </div>
      )}
      {/* Immersive high-end background */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.4] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]" />
      <div className="absolute top-[-15%] left-[-5%] w-[50%] h-[50%] bg-emerald-100/30 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-15%] right-[-5%] w-[50%] h-[50%] bg-blue-100/30 rounded-full blur-[120px]" />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Modern App Identity */}
        <div className="flex flex-col items-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="h-16 w-16 rounded-[22px] bg-slate-900 flex items-center justify-center shadow-[0_20px_40px_-12px_rgba(15,23,42,0.3)] mb-8 relative">
            <Command className="h-8 w-8 text-emerald-400" />
            <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-emerald-500 border-4 border-[#FDFDFD] flex items-center justify-center shadow-lg">
              <Zap className="h-3 w-3 text-white fill-white" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Studiio Pro</h1>
            <p className="text-[13px] font-bold text-slate-400 uppercase tracking-[0.3em]">Operational Intelligence</p>
          </div>
        </div>

        {/* High-fidelity Card */}
        <div className="bg-white rounded-[48px] border border-slate-200/60 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.06)] p-10 md:p-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200 relative overflow-hidden">
          {/* Glass highlight */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent" />
          
          {error && (
            <div className="mb-10 p-4 rounded-2xl bg-rose-50 border border-rose-100 flex gap-3 text-rose-600 text-[13px] animate-in fade-in zoom-in-95 duration-500">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="font-bold">{error}</p>
            </div>
          )}

          {step === "EMAIL" && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-700">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome</h2>
                <p className="text-[15px] text-slate-500 font-medium">Please enter your professional identity.</p>
              </div>

              <form onSubmit={handleEmailSubmit} noValidate className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em] ml-1">Identity</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                      <Mail className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                      <div className="w-[1px] h-4 bg-slate-100" />
                    </div>
                    <input 
                      type="email" 
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@studiio.au"
                      className="w-full h-15 rounded-[22px] border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[10px] focus:ring-slate-900/5 placeholder:text-slate-300 placeholder:font-medium h-14"
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-15 bg-slate-900 hover:bg-slate-800 text-white rounded-[22px] font-bold text-[16px] transition-all flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-slate-900/10 active:scale-[0.98] h-14"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                    <>
                      Verify Identity <ArrowRight className="h-4.5 w-4.5 group-hover:translate-x-1.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {step === "TENANT_SELECT" && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-700">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Workspaces</h2>
                <p className="text-[15px] text-slate-500 font-medium">Select a studio to access your assets.</p>
              </div>

              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                {tenants.map((tenant) => (
                  (() => {
                    const hasLogo = !!tenant.logoUrl && !failedLogos[tenant.id] && tenant.id !== "MASTER";
                    return (
                  <button 
                    key={tenant.id}
                    onPointerDown={(e) => {
                      // Trigger on pointerdown for instant touch feedback.
                      if (e.button !== 0) return;
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      if (loading) return;
                      pointerSelectedTenantIdRef.current = tenant.id;
                      void handleTenantSelect(tenant);
                    }}
                    onClick={() => {
                      // Suppress click if pointerdown already fired.
                      if (pointerSelectedTenantIdRef.current === tenant.id) {
                        setTimeout(() => {
                          if (pointerSelectedTenantIdRef.current === tenant.id) pointerSelectedTenantIdRef.current = null;
                        }, 0);
                        return;
                      }
                      void handleTenantSelect(tenant);
                    }}
                    disabled={loading}
                    className="w-full flex items-center justify-between p-6 rounded-[28px] border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-slate-200 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.06)] transition-all group disabled:opacity-50 relative overflow-hidden"
                  >
                    <div className="flex items-center gap-5 text-left">
                      <div
                        className={
                          hasLogo
                            ? "h-12 w-12 rounded-[18px] bg-white border border-slate-100 flex items-center justify-center transition-all duration-500 shadow-sm overflow-hidden relative group-hover:border-slate-200"
                            : "h-12 w-12 rounded-[18px] bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-emerald-400 group-hover:border-slate-900 transition-all duration-500 shadow-sm"
                        }
                      >
                        {hasLogo ? (
                          <Image
                            src={formatDropboxUrl(String(tenant.logoUrl))}
                            alt={tenant.name || "Workspace"}
                            fill
                            sizes="48px"
                            className="object-contain p-2"
                            onError={() => setFailedLogos((prev) => ({ ...prev, [tenant.id]: true }))}
                          />
                        ) : (
                          tenant.id === "MASTER" ? <Sparkles className="h-6 w-6" /> : <Building2 className="h-6 w-6" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[15px] font-bold text-slate-900 tracking-tight">{tenant.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{tenant.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                    {loading && selectedTenant?.id === tenant.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
                    ) : (
                      <div className="h-8 w-8 rounded-full border border-slate-100 flex items-center justify-center group-hover:border-slate-200 transition-colors">
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    )}
                  </button>
                    );
                  })()
                ))}
              </div>

              <button 
                onClick={() => setStep("EMAIL")}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em] hover:text-slate-900 transition-colors py-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Change Identity
              </button>
            </div>
          )}

          {step === "OTP" && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-700">
              <div className="space-y-3 text-center">
                <div className="h-16 w-16 rounded-full bg-slate-50 text-slate-900 flex items-center justify-center mx-auto mb-8 relative">
                  <Lock className="h-7 w-7" />
                  <div className="absolute inset-0 rounded-full border-2 border-slate-100 animate-ping opacity-20" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Security Code</h2>
                <p className="text-[14px] text-slate-500 font-medium leading-relaxed">Verification sent to <span className="font-bold text-slate-900 underline underline-offset-4 decoration-emerald-200">{email}</span></p>
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-[0.15em] mt-6 shadow-sm shadow-emerald-500/5">
                  {(() => {
                    const hasSelectedLogo =
                      !!selectedTenant?.logoUrl &&
                      !!selectedTenant?.id &&
                      !failedLogos[selectedTenant.id] &&
                      selectedTenant.id !== "MASTER";
                    return (
                      <>
                        {hasSelectedLogo ? (
                          <span className="relative h-4 w-4 rounded-full bg-white border border-emerald-100 overflow-hidden">
                            <Image
                              src={formatDropboxUrl(String(selectedTenant!.logoUrl))}
                              alt={selectedTenant?.name || "Workspace"}
                              fill
                              sizes="16px"
                              className="object-contain p-[2px]"
                              onError={() =>
                                setFailedLogos((prev) => ({ ...prev, [String(selectedTenant!.id)]: true }))
                              }
                            />
                          </span>
                        ) : (
                          <Building2 className="h-3 w-3" />
                        )}
                        <span>{selectedTenant?.name}</span>
                      </>
                    );
                  })()}
                </div>
              </div>

              <form onSubmit={handleOtpSubmit} noValidate className="space-y-10">
                <div className="grid grid-cols-6 gap-3">
                  {otp.map((digit, i) => (
                    <input 
                      key={i}
                      ref={el => { otpRefs.current[i] = el; }}
                      type="tel" 
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(e.target.value, i)}
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      className="w-full aspect-square rounded-[18px] border border-slate-100 bg-slate-50/50 text-center text-xl font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[10px] focus:ring-slate-900/5"
                    />
                  ))}
                </div>

                <div className="space-y-5">
                  <button 
                    type="submit" 
                    disabled={loading || otp.some(d => !d)}
                    className="w-full h-15 bg-slate-900 hover:bg-slate-800 text-white rounded-[22px] font-bold text-[16px] shadow-2xl shadow-slate-900/10 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] h-14"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Authorize Session"}
                  </button>

                  <div className="text-center">
                    <button 
                      type="button"
                      disabled={loading}
                      onClick={() => sendOtp(email, selectedTenant!.id)}
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-[0.25em] transition-colors py-3"
                    >
                      Resend Code
                    </button>
                  </div>
                </div>
              </form>

              <button 
                type="button"
                disabled={loading}
                onClick={() => setStep(tenants.length > 1 ? "TENANT_SELECT" : "EMAIL")}
                className="w-full flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em] hover:text-slate-900 transition-colors py-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            </div>
          )}
        </div>

        {/* Global Footer */}
        <div className="mt-16 flex items-center justify-center gap-10 animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-700">
          <Link href="#" className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-[0.15em] hover:text-slate-600 transition-all group">
            <ShieldCheck className="h-3 w-3 group-hover:text-emerald-500" /> Security
          </Link>
          <Link href="#" className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-[0.15em] hover:text-slate-600 transition-all group">
            <Globe className="h-3 w-3 group-hover:text-blue-500" /> Status
          </Link>
          <Link href="#" className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.15em] hover:text-slate-600 transition-all">Support</Link>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #e2e8f0;
        }
        .h-15 { height: 3.75rem; }
      `}</style>
    </div>
  );
}
