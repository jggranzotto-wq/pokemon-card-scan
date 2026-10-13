import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.midnightman.cardscan",
  appName: "TCG Card Scan",
  webDir: "www",
  backgroundColor: "#0b1020",
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b1020",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#0b1020",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
  server: {
    androidScheme: "https",
    hostname: "localhost",
    errorPath: "offline.html",
    ...(serverUrl
      ? {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
          allowNavigation: [new URL(serverUrl).host],
        }
      : {}),
  },
};

export default config;
