"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ImageService } from "@/services/images.service";
import UserImage from "@/types/userImage";
import { UserImagesFilter } from "@/components/filter/UserImagesFilter";
import { UserService } from "@/services/users.service";
import { OptimizedImageGrid } from "@/components/OptimizedImageGrid";
import ImageDrawer from "@/components/drawer/ImageDrawer";
import { supabase } from "@/utils/supabase/client";
import { applyUpdateAuditFields, getCurrentProfileId } from "@/utils/supabase/audit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useDebounce } from "use-debounce";

const UNKNOWN_USER_KEY = "unknown";

export default function UserImages() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [userNames, setUserNames] = useState<{ [key: string]: string }>({});
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true); // Start with loading state to prevent flash
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 100; // Larger page size for image grid

  const [imageIdQuery, setImageIdQuery] = useState<string>("");
  const [debouncedQuery] = useDebounce(imageIdQuery.trim(), 500);
  const inputRef = useRef<HTMLInputElement | null>(null);

  type SelectedImage = UserImage & { url: string; profile_id: string };
  const isSelectableImage = (image: UserImage): image is SelectedImage =>
    Boolean(image.url) && Boolean(image.profile_id);

  // Image drawer state
  const [imageDrawerOpen, setImageDrawerOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Search function - service handles all filtering logic
  const searchImages = useCallback(async (term: string, page: number = 1) => {
    setIsLoading(true);
    try {
      const newOffset = (page - 1) * ITEMS_PER_PAGE;
      let result;
      
      if (term.trim()) {
        result = await ImageService.searchImages(
          term,
          ITEMS_PER_PAGE,
          newOffset,
          "user-uploaded",
          filter
        );
      } else {
        result = await ImageService.getAllImagesWithPagination(
          ITEMS_PER_PAGE,
          newOffset,
          "user-uploaded",
          filter
        );
      }
      
      setImages(result.images);
      setTotalCount(result.totalCount);
      setCurrentPage(page);

      // Fetch user names for each unique profile_id
      const userIds = [
        ...new Set(
          result.images
            .map((image: UserImage) => image.profile_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const names = await Promise.all(userIds.map(async (id) => {
        const nameData = await UserService.getNameById(id);
        if (Array.isArray(nameData) && nameData.length > 0) {
          const firstName = nameData[0].first_name || "Unknown";
          const lastName = nameData[0].last_name || "User";
          const name = `${firstName} ${lastName}`;
          return { [id]: name };
        }
        return { [id]: "Unknown User" };
      }));
      const nextNames = Object.assign({}, ...names);
      if (result.images.some((image) => !image.profile_id)) {
        nextNames[UNKNOWN_USER_KEY] = "Unknown User";
      }
      setUserNames(prev => ({ ...prev, ...nextNames }));
    } catch (error) {
      console.error("Error searching images:", error);
      setImages([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [ITEMS_PER_PAGE, filter]);

  // Handle debounced search term changes - reset to page 1
  useEffect(() => {
    searchImages(debouncedQuery, 1);
  }, [debouncedQuery, searchImages]);

  const handleSaveAdditionalContext = async (imageID: string, value: string) => {
    const sb = supabase;
    if (!sb) {
      console.warn("Supabase client unavailable; skipping additional_context update");
      return false;
    }

    try {
      const profileId = await getCurrentProfileId(sb);
      const val: string | null = value?.trim() ? value.trim() : null;
      const payload = applyUpdateAuditFields(
        {
          additional_context: val,
        },
        profileId
      );
      const { error } = await sb
        .from("images")
        .update(payload)
        .eq("id", imageID);

      if (error) {
        console.error("Error updating additional context:", error);
        return false;
      }

      setImages(prev =>
        prev.map(img => (img.id === imageID ? { ...img, additional_context: val } as UserImage : img))
      );
      setSelectedImage(prev =>
        prev && prev.id === imageID ? { ...prev, additional_context: val } : prev
      );

      return true;
    } catch (error) {
      console.error("Error updating additional context:", error);
      return false;
    }
  };

  // Handle image deletion
  const handleImageDeleted = (imageId: string) => {
    // Remove the deleted image from the images array
    setImages(currentImages =>
      currentImages.filter(img => img.id !== imageId)
    );
    // Close the drawer if the deleted image was selected
    if (selectedImage?.id === imageId) {
      setImageDrawerOpen(false);
      setSelectedImage(null);
    }
  };

  // Handle image selection from the optimized grid
  const handleImageSelect = async (imageId: string, _imageUrl: string) => {
    const base = images.find(
      (img): img is SelectedImage => img.id === imageId && isSelectableImage(img)
    );
    if (!base) return;

    let selected: SelectedImage = base;

    if (supabase) {
      const { data, error } = await supabase
        .from("images")
        .select("id, additional_context")
        .eq("id", imageId)
        .single();

      if (!error && data) {
        const ac: string | null = data.additional_context ?? null;
        selected = { ...base, additional_context: ac };

        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId ? ({ ...img, additional_context: ac } as UserImage) : img
          )
        );
      }
    }

    setSelectedImage(selected);
    setImageDrawerOpen(true);
  };


  // Handle page changes
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      searchImages(debouncedQuery, page);
    }
  }, [debouncedQuery, totalPages, searchImages]);

  // Navigation functions
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, totalPages, goToPage]);

  // For display, group by user if filter is "By User"
  const displayImages = useMemo(() => {
    if (filter !== "By User") return { all: images };
    const grouped = images.reduce<Record<string, UserImage[]>>((acc, image) => {
      const userId = image.profile_id ?? UNKNOWN_USER_KEY;
      if (!acc[userId]) acc[userId] = [];
      acc[userId].push(image);
      return acc;
    }, {});
    return grouped;
  }, [images, filter]);

  const handleSearchEnter = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      const q = imageIdQuery.trim();
      if (!q) return;

      const exact = images.find(
        (img): img is SelectedImage => img.id === q && isSelectableImage(img)
      );
      if (exact) {
        setSelectedImage(exact);
        setImageDrawerOpen(true);
        return;
      }

      const all = Object.values(displayImages).flat().filter(isSelectableImage);
      if (all.length === 1) {
        setSelectedImage(all[0]);
        setImageDrawerOpen(true);
        return;
      }
    },
    [imageIdQuery, images, displayImages]
  );
  
  const clearSearch = () => {
    setImageIdQuery("");
    inputRef.current?.focus();
  };

 return (
    <>
      <div className="page-shell">
        <div className="flex flex-wrap items-center gap-4">
          <div className="page-header">
            <h1 className="page-title">User Images</h1>
            <p className="page-subtitle">Browse and manage user-uploaded images.</p>
          </div>
          <UserImagesFilter setFilter={setFilter} />

          {/* Image ID Search (from main) */}
          <div className="ml-auto w-full sm:w-[420px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60 pointer-events-none" />
              <Input
                ref={inputRef}
                value={imageIdQuery}
                onChange={(e) => setImageIdQuery(e.target.value)}
                onKeyDown={handleSearchEnter}
                placeholder="Search by Image ID"
                className="pl-9 pr-10"
              />
              {imageIdQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (Object.keys(displayImages).length === 0 || Object.values(displayImages).every((arr) => arr.length === 0)) ? (
          <p className="text-sm text-muted-foreground">No images found :(</p>
        ) : (
          <>
            {totalCount > 0 && (
              <div className="mb-4 text-sm text-muted-foreground">
                {debouncedQuery ? (
                  <>Found {totalCount.toLocaleString()} image{totalCount !== 1 ? 's' : ''} matching &ldquo;{debouncedQuery}&rdquo;</>
                ) : (
                  <>Showing {totalCount.toLocaleString()} total image{totalCount !== 1 ? 's' : ''}</>
                )}
              </div>
            )}
            {Object.entries(displayImages).map(([userId, userImages]) => {
              const gridImages = userImages
                .filter((image): image is UserImage & { url: string } => Boolean(image.url))
                .map((image) => ({
                  id: image.id,
                  url: image.url,
                }));
              const displayName =
                userId === UNKNOWN_USER_KEY ? "Unknown User" : userNames[userId] || "Loading...";

              return (
                <div key={userId} className="mb-8">
                  {filter === "By User" && <h2 className="text-xl font-medium mb-4">{displayName}</h2>}
                  <OptimizedImageGrid images={gridImages} onSelect={handleImageSelect} maxConcurrentRequests={8} />
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && !isLoading && (
        <div className="flex justify-center items-center gap-2">
          {/* Previous Button */}
          <button
            onClick={goToPreviousPage}
            disabled={currentPage === 1 || isLoading}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          {/* Page Numbers */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  disabled={isLoading}
                  className={`px-3 py-2 rounded text-sm font-medium
                             ${currentPage === pageNum
                               ? 'bg-primary text-primary-foreground'
                               : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                             }
                             disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next Button */}
          <button
            onClick={goToNextPage}
            disabled={currentPage === totalPages || isLoading}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Page Info */}
      {totalCount > 0 && !isLoading && (
        <div className="text-center pb-4 text-sm text-muted-foreground">
          Page {currentPage} of {totalPages} 
          ({totalCount.toLocaleString()} total image{totalCount !== 1 ? 's' : ''})
        </div>
      )}
      </div>

      {/* Image details drawer */}
      {selectedImage && (
        <ImageDrawer
          open={imageDrawerOpen}
          onClose={() => {
            setImageDrawerOpen(false);
            setSelectedImage(null);
          }}
          created={selectedImage.created_datetime_utc}
          url={selectedImage.url}
          user_id={selectedImage.profile_id}
          image_id={selectedImage.id}
          isCommonUse={selectedImage.is_common_use ?? false}
          onImageDeleted={handleImageDeleted}
          // enable editing additional context in the drawer
          additional_context={selectedImage.additional_context}
          showAdditionalContextEditor
          onSaveAdditionalContext={handleSaveAdditionalContext}
        />
      )}
    </>
  );
}
