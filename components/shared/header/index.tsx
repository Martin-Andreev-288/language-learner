import Link from "next/link";
import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import { APP_NAME } from "@/lib/constants";
import NavLinks from "./nav-links";
import UserButton from "./user-button";
import MobileMenu from "./mobile-menu";

const Header = async () => {
  const session = await auth();
  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

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
          {session ? (
            <UserButton
                name={session.user?.name}
                email={session.user?.email}
                defaultTranslateLanguage={defaultTranslateLanguage}
              />
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/sign-in"
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <MobileMenu
          session={session}
          defaultTranslateLanguage={defaultTranslateLanguage}
        />
      </div>
    </header>
  );
};

export default Header;
