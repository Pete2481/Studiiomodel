"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { impersonateTenantAction } from "@/app/actions/master";
import { signIn } from "next-auth/react";

interface ImpersonateButtonProps {
  tenantId: string;
}

export function ImpersonateButton({ tenantId }: ImpersonateButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleImpersonate = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const result = await impersonateTenantAction(tenantId);
      
      if (result.success && result.otp && result.email && result.membershipId) {
        // Use the generated OTP to sign in to the specific tenant membership
        const signInResult = await signIn("credentials", {
          email: result.email,
          tenantId: result.membershipId,
          otp: result.otp,
          redirect: true,
          callbackUrl: "/",
        });

        if (signInResult?.error) {
          alert("Failed to switch: " + signInResult.error);
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
      className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200 disabled:opacity-50"
      title="Enter Studio"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </button>
  );
}

