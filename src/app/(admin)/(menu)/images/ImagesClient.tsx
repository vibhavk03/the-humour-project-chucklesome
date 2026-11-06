"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Category from "@/types/common-use-category";
import UserImage from "@/types/userImage";
import { MultiSelectCategoriesDropdown } from "@/components/filter/MultiSelectCategoriesDropdown";
import { UserImagesFilter } from "@/components/filter/UserImagesFilter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { OptimizedImageGrid } from "@/components/OptimizedImageGrid";
import { ImageService } from "@/services/images.service";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/TimeZoneContext";

type ImageSource = "all" | "common-use" | "user-uploaded";

type ImageProfile = {
  first_name: string | null;
  last_name: string | null;
};

type ImageWithProfile = UserImage & {
  profiles?: ImageProfile | null;
};

type ImagesClientProps = {
  source: ImageSource;
  profileId?: string;
  title?: string;
  subtitle?: string;
};

export default function ImagesClient({
  source,
  profileId,
  title = "Images",
  subtitle = "Browse common-use and user-uploaded images.",
}: ImagesClientProps) {
  const router = useRouter();
  const { timeZone } = useTimeZone();
  const [sourceFilter, setSourceFilter] = useState<ImageSource>(source);
  const effectiveSource = source === "all" ? sourceFilter : source;
  
  // Common state for both sources
  const [images, setImages] = useState<ImageWithProfile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  const [imageIdQuery, setImageIdQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Common Use specific state
  const [selectedCategories, setSelectedCategories] = useState<Category["id"][]>([]);
  
  // User Uploaded specific state
  const [userImagesFilter, setUserImagesFilter] = useState<string>("");
  
  // Debounce image ID search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(imageIdQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [imageIdQuery]);

  useEffect(() => {
    const stored = window.localStorage.getItem("images.viewMode");
    if (stored === "grid" || stored === "list") {
      setViewMode(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("images.viewMode", viewMode);
  }, [viewMode]);

  // Search images based on source and query
  const searchImages = useCallback(async (term: string, page: number = 1) => {
    setIsLoading(true);
    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;

      if (effectiveSource === "common-use") {
        if (selectedCategories.length > 0) {
          const response = await ImageService.getImagesByCategories(
            selectedCategories,
            ITEMS_PER_PAGE,
            offset
          );
          if (response.error) {
            setImages([]);
            setTotalCount(0);
            return;
          }
          setImages((response.data || []) as ImageWithProfile[]);
          setTotalCount(response.totalCount || 0);
        } else if (term) {
          const result = await ImageService.searchCommonUseImages(term, ITEMS_PER_PAGE, offset);
          setImages(result.images as ImageWithProfile[]);
          setTotalCount(result.totalCount);
        } else {
          const result = await ImageService.getAllCommonUseImagesWithPagination(
            ITEMS_PER_PAGE,
            offset
          );
          setImages(result.images as ImageWithProfile[]);
          setTotalCount(result.totalCount);
        }
      } else {
        if (term) {
          const result = await ImageService.searchImages(
            term,
            ITEMS_PER_PAGE,
            offset,
            effectiveSource,
            userImagesFilter,
            profileId
          );
          setImages(result.images as ImageWithProfile[]);
          setTotalCount(result.totalCount);
        } else {
          const result = await ImageService.getAllImagesWithPagination(
            ITEMS_PER_PAGE,
            offset,
            effectiveSource,
            userImagesFilter,
            profileId
          );
          setImages(result.images as ImageWithProfile[]);
          setTotalCount(result.totalCount);
        }
      }

      setCurrentPage(page);
    } catch (error) {
      console.error("Error searching images:", error);
      setImages([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [
    ITEMS_PER_PAGE,
    selectedCategories,
    effectiveSource,
    userImagesFilter,
    profileId,
  ]);

  // Fetch images when source or filters change
  useEffect(() => {
    searchImages(debouncedQuery, 1);
  }, [debouncedQuery, userImagesFilter, searchImages]);

  const handleImageSelect = useCallback((imageId: string, _url: string) => {
    router.push(`/image/${imageId}`);
  }, [router]);

  const totalPages = useMemo(
    () => Math.ceil(totalCount / ITEMS_PER_PAGE),
    [totalCount, ITEMS_PER_PAGE]
  );

  const goToPage = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    searchImages(debouncedQuery, page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [debouncedQuery, searchImages, totalPages]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };

  const handlePageClick = (page: number) => {
    goToPage(page);
  };

  const handleFirstPage = () => {
    goToPage(1);
  };

  const handleLastPage = () => {
    goToPage(totalPages);
  };

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxPagesToShow = 5;
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  const clearSearch = () => {
    setImageIdQuery("");
    setDebouncedQuery("");
    inputRef.current?.focus();
  };

  const gridImages = useMemo(
    () =>
      images
        .filter((image): image is ImageWithProfile & { url: string } => Boolean(image.url))
        .map(image => ({ id: image.id, url: image.url })),
    [images]
  );

  const formatUserName = (image: ImageWithProfile) => {
    const first = image.profiles?.first_name?.trim();
    const last = image.profiles?.last_name?.trim();
    const name = [first, last].filter(Boolean).join(" ");
    if (name) return name;
    if (image.is_common_use) return "Common Use";
    return "Unknown User";
  };

  const visibleStart = totalCount === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const visibleEnd = Math.min(currentPage * ITEMS_PER_PAGE, totalCount);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
  };

  return (
    <>
      <div className="page-shell">
        <div className="flex flex-wrap items-center gap-4">
          <div className="page-header">
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>

        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Image Search */}
          <div className="flex-1 min-w-[240px] sm:min-w-[320px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60 pointer-events-none" />
              <Input
                ref={inputRef}
                value={imageIdQuery}
                onChange={e => setImageIdQuery(e.target.value)}
                placeholder="Search by ID, description, celebrity, or context"
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

          {source === "all" && (
            <div className="w-full sm:w-[220px]">
              <Select
                value={effectiveSource}
                onValueChange={(value) => setSourceFilter(value as ImageSource)}
              >
                <SelectTrigger aria-label="Image source">
                  <SelectValue placeholder="All images" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All images</SelectItem>
                  <SelectItem value="common-use">Common-use only</SelectItem>
                  <SelectItem value="user-uploaded">User-uploaded only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {effectiveSource === "common-use" ? (
            <div className="w-full sm:w-[260px]">
              <MultiSelectCategoriesDropdown
                selectedCategories={selectedCategories}
                setSelectedCategories={setSelectedCategories}
                showAddCategory={false}
              />
            </div>
          ) : (
            <UserImagesFilter setFilter={setUserImagesFilter} />
          )}

          <div className="flex items-center gap-2 sm:ml-auto">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
            >
              <List className="h-4 w-4" />
              List
            </Button>
          </div>
        </div>

        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : images.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images found :(</p>
          ) : (
            <>
              {viewMode === "grid" ? (
                <OptimizedImageGrid
                  images={gridImages}
                  onSelect={handleImageSelect}
                  gridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-5 max-w-4xl"
                />
              ) : (
                <div className="table-shell">
                  <div className="overflow-x-auto">
                    <table className="min-w-[860px] w-full table-base table-fixed">
                      <thead className="table-head">
                        <tr>
                          <th className="w-20">Image</th>
                          <th>Description</th>
                          <th className="w-32">Source</th>
                          <th className="w-52">User</th>
                          <th className="w-64">Created</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {images.map((image) => {
                          const description =
                            image.image_description ||
                            image.additional_context ||
                            image.celebrity_recognition ||
                            "—";
                          const userLabel = formatUserName(image);
                          const sourceLabel = image.is_common_use ? "Common use" : "User uploaded";

                          return (
                            <tr
                              key={image.id}
                              className={cn(
                                "h-14 cursor-pointer hover:bg-muted/60",
                                !image.url && "text-muted-foreground"
                              )}
                              onClick={() => handleImageSelect(image.id, image.url ?? "")}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleImageSelect(image.id, image.url ?? "");
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`View image ${image.id}`}
                            >
                              <td>
                                {image.url ? (
                                  <img
                                    src={image.url}
                                    alt="Image thumbnail"
                                    className="h-10 w-10 rounded-md border border-border/60 object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-md border border-dashed border-border/60 bg-muted/30" />
                                )}
                              </td>
                              <td>
                                <div className="truncate text-sm" title={description}>
                                  {description}
                                </div>
                              </td>
                              <td>
                                <Badge variant="secondary">{sourceLabel}</Badge>
                              </td>
                              <td>
                                <div className="truncate text-sm text-muted-foreground" title={userLabel}>
                                  {userLabel}
                                </div>
                              </td>
                              <td className="text-sm text-muted-foreground">
                                <div className="whitespace-nowrap" title={formatDateTime(image.created_datetime_utc)}>
                                  {formatDateTime(image.created_datetime_utc)}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {visibleStart} to {visibleEnd} of {totalCount} images
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={handleFirstPage} disabled={currentPage === 1 || isLoading}>
                      First
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 1 || isLoading}>
                      Previous
                    </Button>
                    {pageNumbers.map(page => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageClick(page)}
                        disabled={isLoading}
                      >
                        {page}
                      </Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages || isLoading}>
                      Next
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleLastPage} disabled={currentPage === totalPages || isLoading}>
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </>
  );
}
