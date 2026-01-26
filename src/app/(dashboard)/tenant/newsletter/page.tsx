import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewsletterEditor } from "@/components/reminders/newsletter-editor";
import { redirect } from "next/navigation";
import { deleteNewsletterDraft, saveNewsletterDraft, sendNewsletter } from "@/app/actions/newsletter";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

export default async function NewsletterPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Newsletter Broadcast" 
        subtitle="Send updates, news, and announcements directly to your clients." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <NewsletterDataWrapper session={session} />
      </Suspense>
    </div>
  );
}

async function NewsletterDataWrapper({ session }: { session: any }) {
  const tenantId = session.user.tenantId as string;

  const [clients, tenant] = await Promise.all([
    prisma.client.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, businessName: true },
      orderBy: { businessName: "asc" }
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    }),
  ]);

  const formattedClients = clients.map(c => ({
    id: c.id,
    name: c.businessName || c.name
  }));

  const settings = (tenant?.settings && typeof tenant.settings === "object") ? (tenant.settings as any) : {};
  const initialDrafts = Array.isArray(settings.newsletterDrafts) ? settings.newsletterDrafts : [];

  return (
    <NewsletterEditor 
      clients={formattedClients} 
      onSend={sendNewsletter}
      initialDrafts={initialDrafts}
      onSaveDraft={saveNewsletterDraft as any}
      onDeleteDraft={deleteNewsletterDraft as any}
    />
  );
}
