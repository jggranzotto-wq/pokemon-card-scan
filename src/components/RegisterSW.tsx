"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide());
      return;
    }
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js");
  }, []);
  return null;
}
