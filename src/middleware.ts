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
  // NOTE: we still run demo-guards for logged-in users on certain /api/auth routes (see below).
  if (isPublicBooking || isPublicGallery || isManifest || isFavicon || isAppIcons) return;

  if (isAuthPage) {
    if (isLoggedIn) {
      return Response.redirect(new URL("/", req.nextUrl));
    }
    return;
  }

  if (!isLoggedIn) {
    // Keep /api/auth routes reachable for login/otp.
    if (isApiAuthRoute) return;
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  // Role-based routing
  const user = req.auth?.user as any;
  const path = req.nextUrl.pathname;

  const isReadOnlyDemo = !!user?.permissions?.readOnlyDemo;
  if (isReadOnlyDemo) {
    const method = String(req.method || "").toUpperCase();

    // Block integration connects even though they are GET (prevents OAuth flow + tokens).
    if (path.startsWith("/api/auth/dropbox") || path.startsWith("/api/auth/google-drive")) {
      return new Response("Demo account is read-only.", { status: 403 });
    }

    // Keep demo users out of settings entirely (integrations + billing, etc).
    if (path.startsWith("/tenant/settings")) {
      return Response.redirect(new URL("/", req.nextUrl));
    }

    // Block any non-read request (prevents Server Actions + form submits).
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      return new Response("Demo account is read-only.", { status: 403 });
    }
  }

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

