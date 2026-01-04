"use client";

import { useEffect } from "react";
import { useDashboard } from "./dashboard-context";

interface ShellSettingsProps {
  title: string;
  subtitle?: string;
}

export function ShellSettings({ title, subtitle }: ShellSettingsProps) {
  const { setTitle, setSubtitle } = useDashboard();

  useEffect(() => {
    setTitle(title);
    if (subtitle) {
      setSubtitle(subtitle);
    }
  }, [title, subtitle, setTitle, setSubtitle]);

  return null;
}
