import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ReminderTemplateEditor } from "@/components/reminders/reminder-template-editor";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Booking Reminders" 
        subtitle="Configure automated notifications to keep your clients informed and prepared." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <RemindersDataWrapper session={session} />
      </Suspense>
    </div>
  );
}

async function RemindersDataWrapper({ session }: { session: any }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { settings: true }
  });

  const settings = ((tenant as any)?.settings as any) || {};
  const reminderTemplate = settings.reminderTemplate;

  return <ReminderTemplateEditor initialTemplate={reminderTemplate} />;
}
