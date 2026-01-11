
"use server";

import { auth } from "@/auth";
import { getIdealSunTime as getIdealSunTimeService, calculateTravelTime as calculateTravelTimeService } from "@/server/services/logistics.service";

export async function getIdealSunTime(address: string, date: Date, type: "SUNRISE" | "DUSK") {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    const result = await getIdealSunTimeService(address, date, type);
    if (!result) return { success: false, error: "Failed to calculate sun time" };

    return { success: true, ...result };
  } catch (error: any) {
    console.error("GET IDEAL SUN TIME ACTION ERROR:", error);
    return { success: false, error: error.message };
  }
}

export async function calculateTravelTime(origin: string, destination: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    const result = await calculateTravelTimeService(origin, destination);
    if (!result) return { success: false, error: "Failed to calculate travel time" };

    return { success: true, ...result };
  } catch (error: any) {
    console.error("CALCULATE TRAVEL TIME ACTION ERROR:", error);
    return { success: false, error: error.message };
  }
}

