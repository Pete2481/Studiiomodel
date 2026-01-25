import { headers } from "next/headers";
import { ShellSettings } from "@/components/layout/shell-settings";
import { MapsClient } from "./maps-client";

export const dynamic = "force-dynamic";

export default async function MapsPage() {
  // Ensure this route is always dynamic and not cached unexpectedly.
  await headers();

  return (
    <div className="space-y-8 md:space-y-12 w-full max-w-full overflow-x-hidden">
      <ShellSettings title="Maps" subtitle="Delivered jobs map (private)" />
      <MapsClient />
    </div>
  );
}

