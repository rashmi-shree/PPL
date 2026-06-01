"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/native";

const DARK_BG = "#0f1115";
const LIGHT_BG = "#f4f5f7";

// Runs only inside the Capacitor Android shell: hides the splash screen once
// the web app is ready and keeps the OS status bar in sync with the theme.
export default function NativeShell() {
  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;

    (async () => {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      const { SplashScreen } = await import("@capacitor/splash-screen");

      const apply = async () => {
        const light =
          document.documentElement.getAttribute("data-theme") === "light";
        try {
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setStyle({ style: light ? Style.Light : Style.Dark });
          await StatusBar.setBackgroundColor({
            color: light ? LIGHT_BG : DARK_BG,
          });
        } catch {
          // status bar API is Android-only / may be unavailable
        }
      };

      await apply();
      if (!cancelled) await SplashScreen.hide();

      // React to theme toggles (data-theme attribute on <html>).
      const observer = new MutationObserver(apply);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      if (cancelled) observer.disconnect();
      else (window as unknown as { __pplThemeObserver?: MutationObserver }).__pplThemeObserver = observer;
    })();

    return () => {
      cancelled = true;
      const w = window as unknown as { __pplThemeObserver?: MutationObserver };
      w.__pplThemeObserver?.disconnect();
    };
  }, []);

  return null;
}
