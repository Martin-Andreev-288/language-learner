import { NextResponse, NextRequest } from "next/server";

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hasSession = request.cookies.has("sAccessToken");

    const isPublic =
        pathname === "/" ||
        pathname === "/access-denied" ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/api/auth") ||
        pathname === "/rules";

    if (!hasSession && !isPublic) {
        return NextResponse.redirect(new URL("/access-denied", request.url));
    }

    if (hasSession && pathname.startsWith("/auth")) {
        return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};