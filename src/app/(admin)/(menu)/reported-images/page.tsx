"use client";

import { useState, useEffect } from "react"; 
import { ImageService } from "@/services/images.service";
import { useToast } from "@/hooks/use-toast";
import { ReportedImages } from "@/types/images";
import { ReportedItemCard } from "@/components/card/ReportedItemCard"; 
import { deleteImageAction } from "@/app/actions/delete-image";

export default function ReportedImagesPage() {
  const [reportedImages, setReportedImages] = useState<ReportedImages[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchReportedImages = async () => { 
      try {
        const data = await ImageService.getAllReportedImages();
        console.log("Fetched Reported images:", data); 
        setReportedImages(data);
      } catch (error) {
        console.error("Error fetching reported images:", error); 
      }
    };

    fetchReportedImages();
  }, []);
  
  const handleDeleteImage = async (imageId: string) => {
    const result = await deleteImageAction(imageId);
    if (result.success) {
      console.log("Image deleted successfully.");
      setReportedImages((prevImages) =>
        prevImages.filter((image) => image.image_id !== imageId)
      );
      toast({ 
        title: "Success", 
        description: "Image deleted successfully" 
      });
    } else {
      console.error("Failed to delete image.");
      toast({ 
        title: "Error", 
        description: result.error 
      });
    } 
  };

  const handleKeepImage = async (reportedImageId: number) => {
    const success = await ImageService.keepReportedImage(reportedImageId);
    if (success) {
      console.log("Image kept successfully, report dismissed.");
      setReportedImages((prevImages) =>
        prevImages.filter((image) => image.id !== reportedImageId)
      );
      toast({ 
        title: "Success", 
        description: "Image kept successfully, report dismissed" 
      });
    } else {
      console.error("Failed to dismiss reported image.");
      toast({ 
        title: "Error", 
        description: "Failed to dismiss reported image." 
      });
    } 
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Reported Images</h1>
        <p className="page-subtitle">Review flagged images and take action.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportedImages.map((image) => (
          <ReportedItemCard
            key={image.id}
            item={image}
            type="image"
            onDelete={handleDeleteImage}
            onKeep={handleKeepImage}
          />
        ))}
      </div>
    </div>
  );
}
