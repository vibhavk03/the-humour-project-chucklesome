import React, { useState, memo } from 'react';

// variant sizes
const THUMBNAIL_SIZES = [320, 480, 640, 750, 828, 1080, 1200, 1920, 2048, 3840] as const;

interface ImageInfo {
  id: string;
  url: string;
}

// Helper function to parse S3 URLs and generate thumbnail URLs
const parseImageUrl = (url: string) => {
  // Match pattern: https://images.domain.com/userId/imageId.extension
  const match = url.match(/https?:\/\/[^\/]+\/([^\/]+)\/([^\/\?]+)\.([^\/\?\s]+)/);
  if (match) {
    const [, userId, imageId, extension] = match;
    return { userId, imageId, extension };
  }
  return null;
};

const generateThumbnailUrls = (
  baseUrl: string, 
  userId: string, 
  imageId: string, 
  extension: string
) => {
  const basePath = `${baseUrl}/${userId}/${imageId}`;
  
  return {
    original: `${basePath}.${extension}`,
    thumbnails: THUMBNAIL_SIZES.reduce((acc, size) => {
      acc[size] = `${basePath}-${size}.${extension}`;
      return acc;
    }, {} as Record<number, string>),
    srcSet: THUMBNAIL_SIZES
      .map(size => `${basePath}-${size}.${extension} ${size}w`)
      .join(', '),
    gridUrl: `${basePath}-${THUMBNAIL_SIZES.find(size => size >= 640) || 640}.${extension}`,
    blurUrl: `${basePath}-${640}.${extension}`
  };
};

interface ImageGridItemProps {
  image: ImageInfo;
  onSelect: (id: string, url: string) => void;
  requestId: number;
  maxConcurrentRequests: number;
}

const ImageGridItem: React.FC<ImageGridItemProps> = memo(function ImageGridItem({
  image,
  onSelect,
  requestId,
  maxConcurrentRequests,
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Parse URL to get thumbnail info
  const imageInfo = parseImageUrl(image.url);
  let displayUrl = image.url;
  let blurUrl = image.url;
  let srcSet = '';

  if (imageInfo) {
    const baseUrl = image.url.split('/').slice(0, 3).join('/');
    const thumbnails = generateThumbnailUrls(
      baseUrl, 
      imageInfo.userId, 
      imageInfo.imageId, 
      imageInfo.extension
    );
    displayUrl = thumbnails.gridUrl;
    blurUrl = thumbnails.blurUrl;
    srcSet = thumbnails.srcSet;
  }

  // Simple rate limiting by delaying image load based on position
  const loadDelay = Math.floor(requestId / maxConcurrentRequests) * 100;

  const handleSelect = () => {
    onSelect(image.id, image.url);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect();
    }
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden 
      border-2 border-[#555555] hover:border-[#888888] group w-full aspect-square 
      bg-gradient-to-br from-gray-100/50 to-gray-200/50 
      dark:from-gray-800/50 dark:to-gray-900/50 snap-center transition-colors duration-300 cursor-pointer"
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Open image details"
    >
      
      {imageLoaded && !imageError && (
        <>
          <div className="absolute inset-0">
            <img
              src={blurUrl}
              alt=""
              className="w-full h-full object-cover blur-xl opacity-30"
              loading="lazy"
            />
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center p-2">
            <img
              src={displayUrl}
              srcSet={srcSet}
              sizes="(max-width: 640px) 640px, (max-width: 768px) 400px, 300px"
              alt="Selectable image"
              className="w-full h-full object-contain group-hover:scale-105 
              transition-transform duration-300"
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              style={{ 
                transitionDelay: `${loadDelay}ms` 
              }}
            />
          </div>
          
          <div className="absolute bottom-2 right-2 opacity-0 
          group-hover:opacity-100 transition-opacity duration-300">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleSelect();
              }}
              className="bg-[#FFD700]/90 text-black px-2 sm:px-3 
              md:px-4 py-0.5 sm:py-1 md:py-1.5 rounded-lg text-[10px] 
              xs:text-xs sm:text-sm md:text-base 
              font-medium hover:bg-[#FFD700] transition-colors"
            >
              More Info
            </button>
          </div>
        </>
      )}

      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <img
            src={displayUrl}
            srcSet={srcSet}
            sizes="(max-width: 640px) 640px, (max-width: 768px) 400px, 300px"
            alt="Selectable image"
            className="w-full h-full object-contain"
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            style={{ 
              transitionDelay: `${loadDelay}ms` 
            }}
          />
        </div>
      )}
      
      {imageError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center 
        gap-2 bg-black/10">
          <span className="text-xs text-destructive">Failed to load</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setImageError(false);
              setImageLoaded(false);
            }}
            className="px-2 py-1 bg-[#FFD700]/20 hover:bg-[#FFD700]/30 rounded 
            text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
    </div>
  );
});

interface OptimizedImageGridProps {
  images: ImageInfo[];
  onSelect: (id: string, url: string) => void;
  maxConcurrentRequests?: number;
  gridClassName?: string;
}

export const OptimizedImageGrid: React.FC<OptimizedImageGridProps> = ({
  images,
  onSelect,
  maxConcurrentRequests = 8, // Limit concurrent S3 requests
  gridClassName,
}) => {
  const defaultGridClassName = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 md:gap-6";

  return (
    <div className={gridClassName ?? defaultGridClassName}>
      {images.map((image, index) => (
        <ImageGridItem
          key={image.id}
          image={image}
          onSelect={onSelect}
          requestId={index}
          maxConcurrentRequests={maxConcurrentRequests}
        />
      ))}
    </div>
  );
};
