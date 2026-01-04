import "./globals.css";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/layout/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Studiio Portal",
  description: "Unified Multi-Tenant Photography Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // We removed dynamic auth checks from here to solve the "headers outside request scope" error
  // Branding is now handled dynamically within the DashboardShell and other page-level components.
  
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-slate-50 antialiased`}>
        <SessionProvider>
          <ThemeProvider brandColor="#10b981">
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
