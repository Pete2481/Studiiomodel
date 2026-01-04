"use client";

import { useState } from "react";
import { toggleSubscriptionOverwriteAction } from "@/app/actions/master";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

interface SubscriptionOverwriteToggleProps {
  tenantId: string;
  initialValue: boolean;
}

export function SubscriptionOverwriteToggle({ tenantId, initialValue }: SubscriptionOverwriteToggleProps) {
  const [isOverwritten, setIsOverwritten] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    setIsLoading(true);
    const newValue = !isOverwritten;
    try {
      const result = await toggleSubscriptionOverwriteAction(tenantId, newValue);
      if (result.success) {
        setIsOverwritten(newValue);
      } else {
        alert(result.error || "Failed to update subscription");
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        "h-9 px-3 rounded-xl flex items-center gap-2 transition-all border",
        isOverwritten 
          ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
          : "bg-slate-50 text-slate-400 border-slate-200 grayscale opacity-50 hover:grayscale-0 hover:opacity-100"
      )}
      title={isOverwritten ? "Deactivate Master Overwrite" : "Activate Master Overwrite"}
    >
      <ShieldCheck className={cn("h-4 w-4", isLoading && "animate-pulse")} />
      <span className="text-[10px] font-black uppercase tracking-widest">
        {isOverwritten ? "PRO (OVERWRITE)" : "OFF"}
      </span>
    </button>
  );
}

