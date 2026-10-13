import { Suspense } from "react";
import { CardScreen } from "@/components/CardScreen";

export default function CardPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-phone px-4 pt-8 text-sm text-paper-mute">Loading card…</main>}>
      <CardScreen />
    </Suspense>
  );
}
