import { useState, useEffect } from "react";
import Image from "next/image";
import UserImage from "@/types/userImage";
import { useTimeZone } from "@/components/TimeZoneContext";

interface ImageCardSimpleProps {
  image: UserImage;
  onClick?: () => void;
}

export default function ImageCardSimple({ image, onClick }: ImageCardSimpleProps) {
  const { timeZone } = useTimeZone();
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);

  const imageUrl = image.url ?? null;

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
    <div 
      className={onClick ? "cursor-pointer" : ""} 
      onClick={onClick}
    >
      <div className="relative">
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
            loading="eager"
            priority={true}
            quality={60}
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
          />
        ) : (
          <div className="flex items-center justify-center bg-muted h-48">
            <p className="text-sm text-muted-foreground">
              {imageUrl ? "Failed to load image" : "Image unavailable"}
            </p>
          </div>
        )}
      </div>
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
  );
}
