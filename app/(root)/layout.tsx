import Header from "@/components/shared/header";
import Footer from "@/components/footer";
import TipBanner from "@/components/shared/tip-banner";
import { pickTip } from "@/lib/learning-tips";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex flex-col bg-[url('/app-background1.png')] bg-cover bg-center bg-fixed">
      {/* Above the header, matching the rotating-quote strip you pointed
          at (Question 387). Here rather than in app/layout.tsx on purpose:
          this layout does not wrap sign-in and sign-up, and a note about
          how to study is noise on a login form.

          The tip is picked here, on the server, so the first paint has one
          already — see components/shared/tip-banner.tsx for why the
          component picks every subsequent one itself. */}
      <TipBanner initialTip={pickTip()} />
      <Header />
      <div className="flex-1 wrapper">{children}</div>
      <Footer />
    </div>
  );
}
