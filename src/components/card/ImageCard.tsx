import { useState, useEffect } from "react";
import ImageDrawer from "../drawer/ImageDrawer";
import Image from "next/image";
import UserImage from "@/types/userImage";
import { useTimeZone } from "@/components/TimeZoneContext";

interface ImageCardProps {
  image: UserImage;
  onImageDeleted?: (imageId: string) => void;
}

export default function ImageCard({ image, onImageDeleted }: ImageCardProps) {
  const { timeZone } = useTimeZone();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Format image URL to avoid CORS issues
  // Next.js Image component handles CORS better with proper configuration
  const imageUrl = image.url ?? null;
  const canOpenDrawer = Boolean(imageUrl && image.profile_id);

  // Reset state when image changes
  useEffect(() => {
    setImageError(false);
    setLoading(Boolean(imageUrl));
  }, [imageUrl]);

  const handleImageLoad = () => {
    setLoading(false);
  };

  const handleImageError = () => {
    console.warn(`Failed to load image: ${imageUrl}`);
    setImageError(true);
    setLoading(false);
  };

  return (
    <>
      <div
        onClick={canOpenDrawer ? () => setDrawerOpen(true) : undefined}
        className={`relative ${canOpenDrawer ? "cursor-pointer" : "cursor-not-allowed"}`}
      >
        {/* Loading state */}
        {loading && imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        )}
        
        {!imageError && imageUrl ? (
          <Image
            src={imageUrl}
            alt={`Uploaded image ${image.id}`}
            width={300}
            height={200}
            className="w-full h-48 object-cover"
            onError={handleImageError}
            onLoad={handleImageLoad}
            loading="eager" // Change to eager loading for initial viewport
            priority={true} // Add priority for images that are likely in the viewport
            quality={60}
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <p className="text-sm text-muted-foreground">
              {imageUrl ? "Failed to load image" : "Image unavailable"}
            </p>
          </div>
        )}
        <div className="p-2">
          <p className="text-xs text-muted-foreground">
            Uploaded:{" "}
            {new Date(image.created_datetime_utc).toLocaleString("en-US", {
              timeZone,
              timeZoneName: "short",
            })}
          </p>
        </div>
      </div>
      {imageUrl && image.profile_id && (
        <ImageDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          created={image.created_datetime_utc}
          url={imageUrl}
          user_id={image.profile_id}
          image_id={image.id}
          isCommonUse={image.is_common_use ?? false}
          onImageDeleted={onImageDeleted}
        />
      )}
    </>
  );
}
