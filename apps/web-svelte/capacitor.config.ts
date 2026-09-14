import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pl.jakstoimy.app",
  appName: "JakStoimy",
  webDir: "build",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#020617",
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
