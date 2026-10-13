import { Suspense } from "react";
import { ListScreen } from "@/components/ListScreen";

export default function ListPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-phone px-4 pt-8 text-sm text-paper-mute">Loading listing…</main>}>
      <ListScreen />
    </Suspense>
  );
}
