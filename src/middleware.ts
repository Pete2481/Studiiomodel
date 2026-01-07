import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login");
  const isApiAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isPublicBooking = req.nextUrl.pathname.startsWith("/book/");
  const isPublicGallery = req.nextUrl.pathname.startsWith("/gallery/");

  if (isApiAuthRoute || isPublicBooking || isPublicGallery) return;

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
    const allowedPaths = ["/tenant/edits", "/api", "/login", "/logout"];
    const isAllowed = allowedPaths.some(p => path.startsWith(p)) || path === "/";
    
    if (!isAllowed) {
      return Response.redirect(new URL("/tenant/edits", req.nextUrl));
    }
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

