import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "./AuthProvider";
import ServiceWorker from "./ServiceWorker";

export const metadata: Metadata = {
  title: "PPL Workout Tracker",
  description:
    "Push · Pull · Legs strength & hypertrophy program with personal weight tracking.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PPL",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f1115",
};

const themeScript = `try{var t=localStorage.getItem('ppl-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
