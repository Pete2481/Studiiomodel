import { AppBottomNav } from "@/components/app/app-bottom-nav";
import { AppInstallPrompt } from "@/components/app/app-install-prompt";
import { MobileTopBar } from "@/components/app/mobile-top-bar";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MobileSearchProvider } from "@/components/app/mobile-search-context";
import { MobileMenuProvider } from "@/components/app/mobile-menu-context";
import { GuideProvider } from "@/components/layout/guide-context";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers();
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <GuideProvider>
      <MobileMenuProvider>
        <MobileSearchProvider>
          <div className="flex flex-col min-h-screen bg-white">
            {/* Static Top Bar */}
            <MobileTopBar />

            {/* Mobile App Shell */}
            <main className="relative touch-pan-y pt-12">
              <div className="pb-32">
                {children}
              </div>
            </main>

            {/* Persistent Bottom Nav */}
            <AppBottomNav />

            {/* PWA Install Flow */}
            <AppInstallPrompt />
          </div>
        </MobileSearchProvider>
      </MobileMenuProvider>
    </GuideProvider>
  );
}
