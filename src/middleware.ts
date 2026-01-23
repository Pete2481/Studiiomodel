import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login");
  const isApiAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isPublicBooking = req.nextUrl.pathname.startsWith("/book/");
  const isPublicGallery = req.nextUrl.pathname.startsWith("/gallery/");
  const isManifest = req.nextUrl.pathname === "/manifest.webmanifest";
  const isFavicon = req.nextUrl.pathname === "/favicon.ico";
  const isAppIcons = req.nextUrl.pathname.startsWith("/icon-") || req.nextUrl.pathname.startsWith("/apple-icon") || req.nextUrl.pathname.startsWith("/android-icon");

  // Always allow unauthenticated access to public assets/metadata.
  // Otherwise the browser fetches HTML redirects which causes "Manifest: Syntax error" warnings.
  if (isApiAuthRoute || isPublicBooking || isPublicGallery || isManifest || isFavicon || isAppIcons) return;

  if (isAuthPage) {
    if (isLoggedIn) {
      return Response.redirect(new URL("/", req.nextUrl));
    }
    return;
  }

  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  // Role-based routing
  const user = req.auth?.user as any;
  const path = req.nextUrl.pathname;

  // 2. Restricted Role Routing (Editors/Team Members)
  if (user?.role === "EDITOR" || user?.role === "TEAM_MEMBER") {
    // Force restricted roles into their portal landing page.
    if (path === "/") {
      return Response.redirect(new URL("/tenant/edits", req.nextUrl));
    }

    const allowedPaths = ["/tenant/edits", "/api", "/login", "/logout"];
    const isAllowed = allowedPaths.some(p => path.startsWith(p));
    
    if (!isAllowed) {
      return Response.redirect(new URL("/tenant/edits", req.nextUrl));
    }
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

