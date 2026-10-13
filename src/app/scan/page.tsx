import { HomeApp } from "@/components/HomeApp";
import { ScanErrorBoundary } from "@/components/ScanErrorBoundary";

export default function ScanPage() {
  return (
    <ScanErrorBoundary>
      <HomeApp />
    </ScanErrorBoundary>
  );
}
