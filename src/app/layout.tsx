import type { Metadata, Viewport } from "next";
import { Marcellus, Montserrat } from "next/font/google";
import "./globals.css";

// latin-ext for the Turkish letters on the menu (Çöp Şiş, Kaşarlı Köfte, Külbastı).
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin", "latin-ext"], display: "swap" });
const marcellus = Marcellus({ variable: "--font-marcellus", weight: "400", subsets: ["latin", "latin-ext"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Istanbul Cafe & Restaurant", template: "%s · Istanbul Cafe & Restaurant" },
  description: "A taste of Turkey, for everyone. Order, call your waiter and pay from your table at Istanbul Cafe & Restaurant, Jabi Lake Mall, Abuja.",
  applicationName: "Istanbul Cafe & Restaurant",
  appleWebApp: { capable: true, title: "Istanbul", statusBarStyle: "black-translucent" },
  icons: { apple: "/pwa-icon/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c162c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${montserrat.variable} ${marcellus.variable} h-full`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
