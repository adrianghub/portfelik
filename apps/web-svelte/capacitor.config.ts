import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pl.jakstoimy.app",
  appName: "JakStoimy",
  webDir: "build",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#020617",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#020617",
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
