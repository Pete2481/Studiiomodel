import "./globals.css";
import { Inter } from "next/font/google";

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
  // Keep the root layout server-only for performance:
  // - Avoid global client providers/hooks in the app shell.
  // - Provide a safe default brand color via CSS variables.
  return (
    <html
      lang="en"
      style={
        {
          "--primary": "#10b981",
          "--primary-soft": "#10b98133",
        } as React.CSSProperties
      }
    >
      <body className={`${inter.className} min-h-screen bg-slate-50 antialiased`}>
        {children}
      </body>
    </html>
  );
}
