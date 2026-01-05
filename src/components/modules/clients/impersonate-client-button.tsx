"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { impersonateClientAction } from "@/app/actions/client";
import { signIn } from "next-auth/react";

interface ImpersonateClientButtonProps {
  clientId: string;
}

export function ImpersonateClientButton({ clientId }: ImpersonateClientButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleImpersonate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoading) return;
    setIsLoading(true);

    try {
      const result = await impersonateClientAction(clientId);
      
      if (result.success && result.otp && result.email && result.membershipId) {
        // Use the generated OTP to sign in to the specific client membership
        const signInResult = await signIn("credentials", {
          email: result.email,
          tenantId: result.membershipId,
          otp: result.otp,
          redirect: false,
        });

        if (signInResult?.error) {
          alert("Failed to switch: " + signInResult.error);
        } else {
          // Manually redirect on success
          window.location.href = "/";
        }
      } else {
        alert(result.error || "Failed to prepare switch");
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
      onClick={handleImpersonate}
      disabled={isLoading}
      className="h-10 w-10 flex items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 hover:text-emerald-500 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm disabled:opacity-50 active:scale-95"
      title="View Portal as Client"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </button>
  );
}

