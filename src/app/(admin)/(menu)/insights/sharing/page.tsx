import ShareChart from "@/components/chart/ShareChart";
import Link from "next/link";

export default function SharingInsightsPage() {
  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Sharing Insights</h1>
        <p className="page-subtitle">See how often captions are shared over time.</p>
      </div>
      <div className="relative">
        <ShareChart />
      </div>
    </div>
  );
}
