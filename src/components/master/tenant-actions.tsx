"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Edit3, ShieldAlert, Zap, Plus, Sparkles } from "lucide-react";
import { EditTenantModal } from "./edit-tenant-modal";
import { cn } from "@/lib/utils";
import { activateTenantAiSuiteFreeTrial, grantTenantAiSuiteFreePack, setTenantAiSuiteEnabled, setTenantAiSuitePackEditsOverride } from "@/app/actions/master-ai";
import { createPortal } from "react-dom";

interface TenantActionsProps {
  tenant: {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    slug: string;
    aiSuiteEnabled?: boolean;
    aiSuiteFreeUnlocksRemaining?: number;
    aiSuitePackEditsOverride?: number | null;
  };
}

export function TenantActions({ tenant }: TenantActionsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const aiEnabled = tenant.aiSuiteEnabled ?? false;
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; placement: "up" | "down" } | null>(null);

  const canUseDom = typeof window !== "undefined";

  const computeMenuPos = () => {
    if (!btnRef.current || !canUseDom) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 224; // w-56
    const menuHeight = aiEnabled ? 170 : 220; // best-effort estimate (avoids offscreen)
    const gutter = 10;
    const openUp = rect.bottom + menuHeight + gutter > window.innerHeight;
    const top = openUp ? rect.top - menuHeight - gutter : rect.bottom + gutter;
    let left = rect.right - menuWidth;
    left = Math.max(gutter, Math.min(left, window.innerWidth - menuWidth - gutter));
    const clampedTop = Math.max(gutter, Math.min(top, window.innerHeight - menuHeight - gutter));
    setMenuPos({ top: clampedTop, left, placement: openUp ? "up" : "down" });
  };

  useEffect(() => {
    if (!isOpen) return;
    computeMenuPos();
    const onResize = () => computeMenuPos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, aiEnabled]);

  const portal = useMemo(() => {
    if (!canUseDom) return null;
    return document.body;
  }, [canUseDom]);

  return (
    <div className="relative">
      <button 
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all text-slate-400 hover:text-slate-900 border border-transparent",
          isOpen && "bg-white border-slate-200 shadow-sm text-slate-900"
        )}
      >
        <MoreVertical className="h-4.5 w-4.5" />
      </button>

      {isOpen && portal && menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-[140]" onClick={() => setIsOpen(false)} />
          <div
            className={cn(
              "fixed w-56 bg-white rounded-2xl border border-slate-100 shadow-2xl shadow-slate-900/10 p-2 z-[150] animate-in fade-in duration-150",
              menuPos.placement === "down" ? "slide-in-from-top-2" : "slide-in-from-bottom-2",
            )}
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button 
              onClick={() => {
                setIsOpen(false);
                setIsEditModalOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors text-sm font-bold"
            >
              <Edit3 className="h-4 w-4" />
              Edit Details
            </button>

            <div className="h-px bg-slate-100 my-1" />

            <button
              onClick={async () => {
                try {
                  setIsBusy(true);
                  const nextEnabled = !aiEnabled;
                  const res = await setTenantAiSuiteEnabled(tenant.id, nextEnabled);
                  if (!(res as any)?.success) throw new Error((res as any)?.error || "Failed to update AI setting");
                  router.refresh();
                } catch (e: any) {
                  alert(e?.message || "Failed to update AI setting");
                } finally {
                  setIsBusy(false);
                  setIsOpen(false);
                }
              }}
              disabled={isBusy}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-bold disabled:opacity-50",
                aiEnabled
                  ? "hover:bg-emerald-50 text-emerald-700"
                  : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
              )}
            >
              <span className="flex items-center gap-3">
                <Zap className="h-4 w-4" />
                AI Suite
              </span>
              <span className={cn("text-[10px] font-black uppercase tracking-widest", aiEnabled ? "text-emerald-600" : "text-slate-400")}>
                {aiEnabled ? "ON" : "OFF"}
              </span>
            </button>

            {!aiEnabled && (
              <button
                onClick={async () => {
                  try {
                    setIsBusy(true);
                    const res = await activateTenantAiSuiteFreeTrial(tenant.id);
                    if (!(res as any)?.success) throw new Error((res as any)?.error || "Failed to activate free trial");
                    router.refresh();
                  } catch (e: any) {
                    alert(e?.message || "Failed to activate free trial");
                  } finally {
                    setIsBusy(false);
                    setIsOpen(false);
                  }
                }}
                disabled={isBusy}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-[#b5d0c1]/40 text-slate-700 hover:text-slate-900 transition-colors text-sm font-bold disabled:opacity-50"
                title="Turns AI ON for this tenant and ensures they have at least 1 free trial pack (15 edits)."
              >
                <span className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4" />
                  Activate free trial
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">15</span>
              </button>
            )}

            <button
              onClick={async () => {
                try {
                  const current = tenant.aiSuitePackEditsOverride ?? null;
                  const input = prompt(
                    "Set AI pack edits override for this tenant (blank to clear). Example: 25",
                    current === null ? "" : String(current),
                  );
                  if (input === null) return;
                  const next = input.trim() === "" ? null : Number(input);
                  if (next !== null && (!Number.isFinite(next) || next < 1)) {
                    alert("Please enter a valid number (>= 1), or leave blank to clear.");
                    return;
                  }
                  setIsBusy(true);
                  const res = await setTenantAiSuitePackEditsOverride(tenant.id, next as any);
                  if (!(res as any)?.success) throw new Error((res as any)?.error || "Failed to update override");
                  router.refresh();
                } catch (e: any) {
                  alert(e?.message || "Failed to update pack edits override");
                } finally {
                  setIsBusy(false);
                  setIsOpen(false);
                }
              }}
              disabled={isBusy}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors text-sm font-bold disabled:opacity-50"
              title="Overrides the number of edits granted per AI pack for this tenant (within Master min/max)."
            >
              <span className="flex items-center gap-3">
                <Sparkles className="h-4 w-4" />
                Pack edits override
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {tenant.aiSuitePackEditsOverride ?? "—"}
              </span>
            </button>

            <button
              onClick={async () => {
                try {
                  setIsBusy(true);
                  const res = await grantTenantAiSuiteFreePack(tenant.id, 1);
                  if (!(res as any)?.success) throw new Error((res as any)?.error || "Failed to grant free pack");
                  router.refresh();
                } catch (e: any) {
                  alert(e?.message || "Failed to grant free pack");
                } finally {
                  setIsBusy(false);
                  setIsOpen(false);
                }
              }}
              disabled={isBusy}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-[#b5d0c1]/40 text-slate-700 hover:text-slate-900 transition-colors text-sm font-bold disabled:opacity-50"
              title="Adds one free AI Suite pack (15 edits) to this tenant"
            >
              <span className="flex items-center gap-3">
                <Plus className="h-4 w-4" />
                Add free pack
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {Number(tenant.aiSuiteFreeUnlocksRemaining ?? 0)}
              </span>
            </button>
            
            <button 
              onClick={() => {
                setIsOpen(false);
                alert("Archive feature coming soon");
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rose-50 text-rose-400 hover:text-rose-600 transition-colors text-sm font-bold"
            >
              <ShieldAlert className="h-4 w-4" />
              Archive Studio
            </button>
          </div>
        </>,
        portal,
      )}

      <EditTenantModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        tenant={tenant}
      />
    </div>
  );
}

