"use client";

import React from "react";
import { GuideProvider } from "./guide-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <GuideProvider>{children}</GuideProvider>;
}

