import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata = {
  title: "Blinko – Digitale Kundenbindung für lokale Unternehmen",
  description:
    "Mit Blinko verbinden lokale Unternehmen NFC, QR-Codes und digitale Treuekarten auf einer Plattform.",
  applicationName: "Blinko",
  // Kurzer Name, wenn die Seite zum Home-Bildschirm hinzugefügt wird
  appleWebApp: { title: "Blinko" },
};


export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
