import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fideliz Admin",
  description: "Plateforme de fidélité",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // TA CLÉ API EN DUR (Copiée depuis ta capture)
  // On remettra la variable plus tard, mais ça va forcer Google à marcher.
  const GOOGLE_API_KEY = "AlzaSyD3z2lopLG0FvN_dOOlsR9Y65bxZRDaUtU";

  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}

        {/* Le Moteur Google Maps avec la clé forcée */}
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`}
          strategy="beforeInteractive" 
        />
      </body>
    </html>
  );
}