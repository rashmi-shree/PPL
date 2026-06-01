"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    // Only register on the deployed web origin. Inside the native (Capacitor)
    // shell the app is served from localhost and assets are already bundled,
    // so the PWA service worker is unnecessary and would only cause noise.
    const { protocol, hostname } = window.location;
    const isWebOrigin =
      protocol === "https:" && hostname !== "localhost" && hostname !== "127.0.0.1";
    if (isWebOrigin && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
