"use client";

import { useState } from "react";
import { UserCheck, Loader2 } from "lucide-react";
import { syncTenantAccessAction } from "@/app/actions/master";

interface SyncAccessButtonProps {
  tenantId: string;
}

export function SyncAccessButton({ tenantId }: SyncAccessButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSync = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const result = await syncTenantAccessAction(tenantId);
      if (result.success) {
        alert(result.message || "Access synced successfully");
      } else {
        alert(result.error || "Failed to sync access");
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
      onClick={handleSync}
      disabled={isLoading}
      className="h-9 px-3 rounded-xl flex items-center gap-2 transition-all border bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100 disabled:opacity-50"
      title="Fix/Sync User Access"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserCheck className="h-4 w-4" />
      )}
      <span className="text-[10px] font-black uppercase tracking-widest">
        Sync Access
      </span>
    </button>
  );
}

