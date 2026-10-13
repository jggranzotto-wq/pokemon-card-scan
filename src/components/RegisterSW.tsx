"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // Do not reload when a new worker takes control. A reload drops the
    // in-flight /api/identify response and the scan looks blank.
    void navigator.serviceWorker.register("/sw.js");
  }, []);
  return null;
}
