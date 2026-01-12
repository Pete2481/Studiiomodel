"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Placement = "top" | "bottom";

type PortalTooltipProps = {
  title?: string;
  content: React.ReactNode;
  placement?: Placement;
  className?: string;
  tooltipClassName?: string;
  children: React.ReactNode;
};

type Coords = { left: number; top: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function PortalTooltip({
  title,
  content,
  placement = "top",
  className,
  tooltipClassName,
  children,
}: PortalTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const compute = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const viewportW = window.innerWidth;
    const padding = 12;
    const left = clamp(rect.left + rect.width / 2, padding, viewportW - padding);

    const top = placement === "top" ? rect.top : rect.bottom;
    setCoords({ left, top });
  };

  useEffect(() => {
    if (!open) return;
    compute();
    const onScroll = () => compute();
    const onResize = () => compute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement]);

  const portalTarget = useMemo(() => (mounted ? document.body : null), [mounted]);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("inline-flex", className)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>

      {open && coords && portalTarget
        ? createPortal(
            <div
              className={cn(
                "fixed z-[9999] pointer-events-none",
                placement === "top" ? "origin-bottom" : "origin-top"
              )}
              style={{
                left: coords.left,
                top: coords.top,
                transform:
                  placement === "top"
                    ? "translate(-50%, calc(-100% - 10px))"
                    : "translate(-50%, 10px)",
              }}
            >
              <div
                className={cn(
                  "w-max max-w-[260px] rounded-2xl border border-white/60 bg-[#b5d0c1]/95 px-4 py-3 shadow-2xl backdrop-blur-md",
                  tooltipClassName
                )}
              >
                {title ? (
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-700">
                    {title}
                  </p>
                ) : null}
                <div className="text-xs font-semibold tabular-nums text-slate-900">{content}</div>
              </div>
              <div
                className={cn(
                  "absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border border-white/60 bg-[#b5d0c1]/95",
                  placement === "top" ? "bottom-[-4px]" : "top-[-4px]"
                )}
              />
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}


