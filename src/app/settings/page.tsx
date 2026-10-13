import { Suspense } from "react";
import { SettingsScreen } from "@/components/SettingsScreen";

export default function SettingsPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-phone px-4 pt-8 text-sm text-paper-mute">Loading settings…</main>}>
      <SettingsScreen />
    </Suspense>
  );
}
