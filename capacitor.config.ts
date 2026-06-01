import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rashmi.ppl",
  appName: "PPL",
  // Static export from `next build` (output: 'export') is bundled into the app.
  webDir: "out",
  android: {
    backgroundColor: "#0f1115",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0f1115",
      showSpinner: false,
    },
  },
};

export default config;
