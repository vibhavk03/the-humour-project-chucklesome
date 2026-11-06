"use client";

import { useEffect, useState } from "react";
import { StudiesService } from "@/services/studies.service";
import type { Study } from "@/types/study";
import QuickStudyClient from "./quick-study-client";

export default function QuickStudyPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await StudiesService.getAllStudies();
      if (!alive) return;
      setStudies(data);
      setIsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Quick Study</h1>
      </div>

      {isLoading ? (
        <div className="page-card py-16 text-center">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : (
        <QuickStudyClient existingStudies={studies} />
      )}
    </div>
  );
}
