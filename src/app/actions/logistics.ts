
"use server";

import { auth } from "@/auth";
import { getIdealSunTime as getIdealSunTimeService, calculateTravelTime as calculateTravelTimeService } from "@/server/services/logistics.service";

export async function getIdealSunTime(
  address: string,
  date: Date,
  type: "SUNRISE" | "DUSK",
  timeZone?: string
): Promise<{ success: true; time: Date; label: string } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    const result = await getIdealSunTimeService(address, date, type, timeZone);
    if (!result) return { success: false, error: "Failed to calculate sun time" };

    return { success: true, time: result.time, label: result.label };
  } catch (error: any) {
    console.error("GET IDEAL SUN TIME ACTION ERROR:", error);
    return { success: false, error: error.message };
  }
}

export async function calculateTravelTime(origin: string, destination: string): Promise<{ success: true; distanceText: string; distanceValue: number; durationText: string; durationValue: number } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    const result = await calculateTravelTimeService(origin, destination);
    if (!result) return { success: false, error: "Failed to calculate travel time" };

    return { 
      success: true, 
      distanceText: result.distanceText,
      distanceValue: result.distanceValue,
      durationText: result.durationText,
      durationValue: result.durationValue
    };
  } catch (error: any) {
    console.error("CALCULATE TRAVEL TIME ACTION ERROR:", error);
    return { success: false, error: error.message };
  }
}

