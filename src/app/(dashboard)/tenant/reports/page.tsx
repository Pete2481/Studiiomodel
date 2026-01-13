import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ReportsOverviewLoader } from "@/components/dashboard/reports-overview-loader";
import { headers } from "next/headers";
import { ShellSettings } from "@/components/layout/shell-settings";

export const dynamic = "force-dynamic";

export default async function ReportsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Performance Insights" 
        subtitle="Monitor revenue, team output, and client value with live dashboards." 
      />

      {/* Shell-first: stats load after paint via API (no UI changes, just load order). */}
      <ReportsOverviewLoader tenantId={session.user.tenantId} />
    </div>
  );
}
