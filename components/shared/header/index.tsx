import Link from "next/link";
import { cookies } from "next/headers";
import { getSSRSession } from "supertokens-node/nextjs";
import { APP_NAME } from "@/lib/constants";
import { ensureSuperTokensInit } from "@/app/config/backend";
import { prisma } from "@/lib/prisma";
import NavLinks from "./nav-links";
import UserButton from "./user-button";
import MobileMenu from "./mobile-menu";

ensureSuperTokensInit();

const Header = async () => {
  const { accessTokenPayload, hasToken } = await getSSRSession(
    (await cookies()).getAll(),
  );
  let user: { name: string | null; email: string | null } | null = null;
  if (hasToken && accessTokenPayload?.sub) {
    const dbUser = await prisma.user.findUnique({
      where: { id: accessTokenPayload.sub as string },
      select: { name: true, email: true },
    });
    if (dbUser) user = dbUser;
  }

  return (
    <header className="bg-gray-800 text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        {/* Left side - Logo / App Name */}
        <Link
          href="/"
          className="text-xl font-bold transition-colors duration-200 hover:text-gray-300"
        >
          📚 {APP_NAME}
        </Link>

        {/* Middle - Desktop Navigation Links */}
        <nav className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </nav>

        {/* Right side - Auth */}
        <div className="hidden md:block">
          {user ? (
            <UserButton name={user.name} email={user.email} />
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth"
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <MobileMenu user={user} />
      </div>
    </header>
  );
};

export default Header;
