import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isAuthenticated = !!req.auth;
    const { pathname } = req.nextUrl;

    const isAuthPage =
        pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

    // If a signed-in user visits an auth page, redirect them to home
    if (isAuthenticated && isAuthPage) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        /*
         * Match all request paths EXCEPT:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico
         * - public folder files
         * - api routes
         */
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
