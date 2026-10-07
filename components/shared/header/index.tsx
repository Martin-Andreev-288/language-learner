import Link from "next/link";
import { auth } from "@/auth";
import { getDefaultTranslateLanguage } from "@/app/actions/user-actions";
import { APP_NAME } from "@/lib/constants";
import NavLinks from "./nav-links";
import UserButton from "./user-button";
import MobileMenu from "./mobile-menu";
import NavHeightSync from "./nav-height-sync";

const Header = async () => {
  const session = await auth();
  const defaultTranslateLanguage = await getDefaultTranslateLanguage();

  return (
    // Sticky, so the sections are one click away however far down a long
    // page you are (Question 454 in video directions.md). Only the header:
    // the tip strip above it scrolls away, since it is read once, not used.
    // z-40 keeps it over the page and its own sticky bars, and under the
    // app's popups and dialogs, which are all z-50.
    //
    // Only on a screen at least 32rem tall. A phone held sideways is about
    // 390px tall, and at that width the title wraps to four lines, so a
    // frozen header would cover nearly half of it for good. There it
    // scrolls away as it always did.
    <header
      data-site-nav
      className="top-0 z-40 bg-gray-800 text-white shadow-lg [@media(min-height:32rem)]:sticky"
    >
      <NavHeightSync />
      {/* Wraps below md for one reason: MobileMenu renders its button and
          its panel as two siblings in this row, so without a second line the
          panel sat *beside* the title — an invisible column when closed that
          pushed the hamburger into the middle of the bar and squeezed the
          title onto three lines, and a tall one when open that the title and
          the ✕ were centred against. The panel is full-width now, so it
          takes the second line on its own. md:flex-nowrap leaves the desktop
          row exactly as it was: nothing there is meant to wrap. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-4 py-4 md:flex-nowrap">
        {/* Left side - Logo / App Name */}
        {/* flex-1 below md is what keeps the hamburger on the same line.
            A wrapping row decides where to break using each item's
            *unwrapped* width, and this title unwrapped is about 316px —
            on a 360px phone that plus the button doesn't fit, so the
            button was dropped onto a line of its own under the title.
            flex-1 makes the title count as only its longest word when the
            row breaks, then grow into whatever is left and wrap its text
            inside that. md:flex-initial puts the desktop sizing back to the
            default it has always had. */}
        <Link
          href="/"
          className="flex-1 text-xl font-bold transition-colors duration-200 hover:text-gray-300 md:flex-initial"
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
