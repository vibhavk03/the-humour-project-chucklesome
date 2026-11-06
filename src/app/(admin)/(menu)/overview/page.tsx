"use client";

import { useEffect, useState } from "react";
import OverviewCard from "@/components/card/OverviewCard";
import {
  fetchProfilesCount,
  fetchScreenshotsCount,
  fetchSharesCount,
} from "@/app/actions/overview";
import { CaptionService } from "@/services/captions.service";
import { Users, Share2, Camera, Flame } from "lucide-react";
import { OverviewChart } from "@/components/chart/OverviewChart";


export default function Overview() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalCaptions, setTotalCaptions] = useState(0);
  const [totalShares, setTotalShares] = useState(0);
  const [totalScreenshots, setTotalScreenshots] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingStats(true);
      try {
        const [usersCount, captionsCount, sharesCount, screenshotsCount] = await Promise.all([
          fetchProfilesCount(),
          CaptionService.getAllCaptionsCount(),
          fetchSharesCount(),
          fetchScreenshotsCount(),
        ]);

        setTotalUsers(usersCount);
        setTotalCaptions(captionsCount);
        setTotalShares(sharesCount);
        setTotalScreenshots(screenshotsCount);
      } catch (error) {
        console.error("Failed to load overview stats:", error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    void fetchData();
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Key stats and activity at a glance.</p>
      </div>
      <div className="grid grid-flow-col gap-4">
        <div className="row-span-1 flex flex-col gap-4">
        <OverviewCard
          title='Users'
          content={totalUsers}
          footer='+ ... from last week'
          icon={Users}
          isLoading={isLoadingStats}
        />
        <OverviewCard
          title='Shares'
          content={totalShares}
          footer='+ ... from last week'
          icon={Share2}
          isLoading={isLoadingStats}
        />
        <OverviewCard
          title='Screenshots'
          content={totalScreenshots}
          footer='+ ... from last week'
          icon={Camera}
          isLoading={isLoadingStats}
        />
        </div>
        <div className="row-span-1 flex flex-col gap-4">
        <OverviewCard
          title='Total Captions'
          content={totalCaptions}
          footer='+ ... from yesterday'
          icon={Flame}
          isLoading={isLoadingStats}
        />
        <OverviewChart/>
        </div>
      </div>
    </div>
  );
}
