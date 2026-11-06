"use client";

import { useState, useEffect } from "react";
import { ReportedCaptions } from "@/types/captions";
import { CaptionService } from "@/services/captions.service";
import { useToast } from "@/hooks/use-toast";
import { ReportedItemCard } from "@/components/card/ReportedItemCard"; 

export default function ReportedCaptionsPage() {
    const [reportedCaptions, setReportedCaptions] = useState<ReportedCaptions[]>([]);
    const { toast } = useToast();

    useEffect(() => {
      const fetchReportedCaptions = async () => {
        try {
            const data = await CaptionService.getAllReportedCaptions();
            console.log("Fetched Reported captions:", data);
            setReportedCaptions(data);
        } catch (error) {
            console.error("Error fetching reported captions:", error);
        }
      };

      fetchReportedCaptions();
    }, []);

    const handleDeleteCaption = async (captionId: string) => {
      const success = await CaptionService.deleteCaption(captionId);
      if (success) {
        console.log("Caption deleted successfully.");
        setReportedCaptions((prevCaptions) =>
          prevCaptions.filter((caption) => caption.caption_id !== captionId)
        );
        toast({ 
          title: "Success", 
          description: "Caption deleted successfully" 
        });
      } else {
        console.error("Failed to delete caption.");
        toast({ 
          title: "Error", 
          description: "Failed to delete caption" 
        });
      } 
    };

    const handleKeepCaption = async (reportedCaptionId: number) => {
      const success = await CaptionService.keepReportedCaption(reportedCaptionId);
      if (success) {
        console.log("Caption kept successfully, report dismissed.");
        setReportedCaptions((prevCaptions) =>
          prevCaptions.filter((caption) => caption.id !== reportedCaptionId)
        );
        toast({ 
          title: "Success", 
          description: "Caption kept successfully, report dismissed" 
        });
      } else {
        console.error("Failed to dismiss reported caption.");
        toast({ 
          title: "Error", 
          description: "Failed to dismiss reported caption." 
        });
      } 
    };

    return (
      <div className="page-shell">
        <div className="page-header">
          <h1 className="page-title">Reported Captions</h1>
          <p className="page-subtitle">Review flagged captions and take action.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportedCaptions.map((caption) => (
            <ReportedItemCard
              key={caption.id}
              item={caption}
              type="caption"
              onDelete={handleDeleteCaption}
              onKeep={handleKeepCaption}
            />
          ))}
        </div>
      </div>
    );
}
