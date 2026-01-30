import Header from "@/components/shared/header";
import Footer from "@/components/footer";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-[#f5f7fa] to-[#c3cfe2]">
      <Header />
      <div className="flex-1 wrapper">{children}</div>
      <Footer />
    </div>
  );
}
