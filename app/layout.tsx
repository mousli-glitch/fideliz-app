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
  // ⚠️ ACTION REQUISE ICI ⚠️
  // 1. Mets ton curseur entre les guillemets ci-dessous.
  // 2. Fais COLLER (Ctrl+V ou Cmd+V).
  // 3. Vérifie qu'il n'y a pas d'espace avant ou après.
  const GOOGLE_API_KEY = "AIzaSyAcidMbRAwpwvmW8ZfjhUrOMrcn-HjT-bs"; 

  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}

        {/* Script Google Maps */}
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`}
          strategy="beforeInteractive" 
        />
      </body>
    </html>
  );
}