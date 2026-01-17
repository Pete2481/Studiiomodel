import {
  Box,
  Camera,
  FileText,
  Moon,
  Plane,
  Sun,
  User,
  Video,
  Wrench,
  Zap,
  Edit3,
} from "lucide-react";

export type ServiceIconStyle = { bg: string; text: string; ring: string };

const ICON_COMPONENTS: Record<string, any> = {
  CAMERA: Camera,
  DRONE: Plane,
  VIDEO: Video,
  FILETEXT: FileText,
  SERVICE: Wrench,
  SUNSET: Sun,
  SUNRISE: Sun,
  DUSK: Moon,
  PACKAGE: Box,
  "EDIT PEN": Edit3,
  PERSON: User,
  USER: User,
  ZAP: Zap,
};

const ICON_STYLES: Record<string, ServiceIconStyle> = {
  CAMERA: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200" },
  DRONE: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-200" },
  VIDEO: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-200" },
  FILETEXT: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-200" },
  SERVICE: { bg: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-200" },
  SUNSET: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-200" },
  SUNRISE: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-200" },
  DUSK: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-200" },
  PACKAGE: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-200" },
  "EDIT PEN": { bg: "bg-lime-50", text: "text-lime-700", ring: "ring-lime-200" },
  PERSON: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-200" },
  USER: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-200" },
  ZAP: { bg: "bg-yellow-50", text: "text-yellow-700", ring: "ring-yellow-200" },
};

export function normalizeServiceIconKey(iconKey: any): string {
  return String(iconKey || "CAMERA").toUpperCase().trim();
}

export function getServiceIconComponent(iconKey: any) {
  const key = normalizeServiceIconKey(iconKey);
  return ICON_COMPONENTS[key] || Camera;
}

export function getServiceIconStyle(iconKey: any): ServiceIconStyle {
  const key = normalizeServiceIconKey(iconKey);
  return ICON_STYLES[key] || ICON_STYLES.CAMERA;
}


