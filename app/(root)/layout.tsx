import Header from "@/components/shared/header";
import Footer from "@/components/footer";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex flex-col bg-[url('/app-background1.png')] bg-cover bg-center bg-fixed">
      <Header />
      <div className="flex-1 wrapper">{children}</div>
      <Footer />
    </div>
  );
}
