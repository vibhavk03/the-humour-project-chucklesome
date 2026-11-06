"use client";

import { useEffect, useMemo, useState } from "react";
import { CaptionSearchResult } from "@/types/captions";
import { CaptionService } from "@/services/captions.service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import CaptionCard from "@/components/card/CaptionCard";
import CaptionMosaicCard from "@/components/card/CaptionMosaicCard";
import { Separator } from "@/components/ui/separator";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SearchType = "all" | "content" | "id" | "imageId" | "profileId";
type SortBy = "created" | "content" | "imageId" | "likes" | "shares";
type SortOrder = "asc" | "desc";
type CaptionViewMode = "table" | "mosaic";
type TableQuery = {
  searchType: SearchType;
  sortBy: SortBy;
  sortOrder: SortOrder;
  itemsPerPage: number;
  currentPage: number;
};

type CaptionsTableProps = {
  title?: string;
  subtitle?: string;
  profileId?: string;
  hideProfileIdFilter?: boolean;
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function CaptionsTable({
  title = "Caption Management",
  subtitle = "Search, sort, and export caption data.",
  profileId,
  hideProfileIdFilter,
}: CaptionsTableProps) {
  const [captions, setCaptions] = useState<CaptionSearchResult[]>([]);
  const [totalCaptions, setTotalCaptions] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounced(searchQuery, 200);
  const [viewMode, setViewMode] = useState<CaptionViewMode>("table");
  const [query, setQuery] = useState<TableQuery>({
    searchType: "all",
    sortBy: "created",
    sortOrder: "desc",
    itemsPerPage: 10,
    currentPage: 1,
  });

  const shouldHideProfileId = hideProfileIdFilter ?? false;

  useEffect(() => {
    setQuery((q) => ({ ...q, currentPage: 1 }));
  }, [searchQuery]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setIsLoading(true);
      try {
        const { searchType, currentPage, itemsPerPage, sortBy, sortOrder } = query;
        const { captions: rows, totalCount } = await CaptionService.searchCaptionsEnhanced({
          searchQuery: debouncedSearchQuery,
          searchType,
          offset: (currentPage - 1) * itemsPerPage,
          limit: itemsPerPage,
          sortBy,
          sortOrder,
          profileId,
        });
        if (!alive) return;
        setCaptions(rows);
        setTotalCaptions(totalCount);
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [debouncedSearchQuery, query, profileId]);

  const totalPages = useMemo(
    () => Math.max(Math.ceil(totalCaptions / query.itemsPerPage), 1),
    [totalCaptions, query.itemsPerPage]
  );

  const rangeText = useMemo(() => {
    if (!totalCaptions) return "No captions found";
    return `${totalCaptions.toLocaleString()} Total Captions`;
  }, [totalCaptions]);

  const scrollAreaClassName = query.itemsPerPage > 100 ? "h-[800px]" : "h-[600px]";
  const mosaicColumnsClassName = "columns-1 gap-4 p-4 sm:columns-2 xl:columns-3 2xl:columns-4";
  const emptyState = (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Search className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">No captions found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your search or sorting
        </p>
      </div>
    </div>
  );

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1">
              <Select
                value={query.searchType}
                onValueChange={(v: SearchType) =>
                  setQuery((q) => ({ ...q, searchType: v, currentPage: 1 }))
                }
              >
                <SelectTrigger className="w-[140px] bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Search className="h-3 w-3" />
                      <span>All Fields</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="id">Caption ID</SelectItem>
                  <SelectItem value="imageId">Image ID</SelectItem>
                  {!shouldHideProfileId && <SelectItem value="profileId">Profile ID</SelectItem>}
                </SelectContent>
              </Select>

              <div className="relative flex-1 min-w-[220px] max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder={
                    query.searchType === "content"
                      ? "Search caption text…"
                      : query.searchType === "id"
                        ? "Search by Caption ID (exact)…"
                        : query.searchType === "imageId"
                          ? "Search by Image ID (exact)…"
                          : query.searchType === "profileId"
                            ? "Search by Profile ID (exact)…"
                            : "Search content or exact IDs…"
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 bg-background border-border"
                />
                {isLoading && searchQuery && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {searchQuery && !isLoading && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select
                onValueChange={(value: string) => {
                  const [field, order] = value.split(":") as [SortBy, SortOrder];
                  setQuery((q) => ({ ...q, sortBy: field, sortOrder: order, currentPage: 1 }));
                }}
                value={`${query.sortBy}:${query.sortOrder}`}
              >
                <SelectTrigger className="w-[180px] bg-background border-border">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created:desc">Date Created (Newest)</SelectItem>
                  <SelectItem value="created:asc">Date Created (Oldest)</SelectItem>
                  <SelectItem value="content:asc">Content (A–Z)</SelectItem>
                  <SelectItem value="content:desc">Content (Z–A)</SelectItem>
                  <SelectItem value="imageId:asc">Image ID (A–Z)</SelectItem>
                  <SelectItem value="imageId:desc">Image ID (Z–A)</SelectItem>
                  <SelectItem value="likes:desc">Most Liked</SelectItem>
                  <SelectItem value="shares:desc">Most Shares</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  className="h-8 px-3"
                  aria-pressed={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                >
                  Table
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "mosaic" ? "secondary" : "ghost"}
                  className="h-8 px-3"
                  aria-pressed={viewMode === "mosaic"}
                  onClick={() => setViewMode("mosaic")}
                >
                  Mosaic
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={String(query.itemsPerPage)}
                  onValueChange={(value) =>
                    setQuery((q) => ({ ...q, itemsPerPage: Number(value), currentPage: 1 }))
                  }
                >
                  <SelectTrigger className="w-[140px] bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                    <SelectItem value="200">200 per page</SelectItem>
                    <SelectItem value="500">500 per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <Card>
              <CardContent className="p-0">
                {viewMode === "table" ? (
                  <>
                    <div className="grid grid-cols-12 items-center gap-3 border-b bg-muted/30 px-4 py-3 text-sm font-semibold text-muted-foreground">
                      <div className="col-span-2">Id</div>
                      <div className="col-span-1 text-center">Image</div>
                      <div className="col-span-3">Caption</div>
                      <div className="col-span-2 text-center">User Name</div>
                      <div className="col-span-3 text-center whitespace-nowrap">Created</div>
                      <div className="col-span-1 text-center">Visibility</div>
                    </div>

                    <ScrollArea className={scrollAreaClassName}>
                      {isLoading ? (
                        <div className="divide-y divide-border">
                          {Array.from({ length: 8 }).map((_, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-12 items-center gap-3 px-4 py-3 animate-pulse"
                            >
                              <div className="col-span-2">
                                <div className="h-4 w-4/5 rounded bg-muted" />
                              </div>
                              <div className="col-span-1 flex justify-center">
                                <div className="h-9 w-9 rounded-md bg-muted" />
                              </div>
                              <div className="col-span-3">
                                <div className="mb-2 h-4 w-4/5 rounded bg-muted" />
                                <div className="h-3 w-2/5 rounded bg-muted" />
                              </div>
                              <div className="col-span-2 flex justify-center">
                                <div className="h-4 w-24 rounded bg-muted" />
                              </div>
                              <div className="col-span-3 flex justify-center">
                                <div className="h-4 w-28 rounded bg-muted" />
                              </div>
                              <div className="col-span-1 flex justify-center">
                                <div className="h-5 w-14 rounded-full bg-muted" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : captions.length === 0 ? (
                        emptyState
                      ) : (
                        <div className="divide-y divide-border">
                          {captions.map((c) => (
                            <CaptionCard key={c.id} caption={c} />
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </>
                ) : (
                  <ScrollArea className={scrollAreaClassName}>
                    {isLoading ? (
                      <div className={mosaicColumnsClassName}>
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div
                            key={i}
                            className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm"
                          >
                            <div
                              className={`animate-pulse bg-muted ${
                                i % 3 === 0 ? "h-80" : i % 3 === 1 ? "h-56" : "h-72"
                              }`}
                            />
                            <div className="space-y-3 p-4">
                              <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                              <div className="h-4 w-full rounded bg-muted animate-pulse" />
                              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                              <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : captions.length === 0 ? (
                      emptyState
                    ) : (
                      <div className={mosaicColumnsClassName}>
                        {captions.map((caption) => (
                          <CaptionMosaicCard key={caption.id} caption={caption} />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary/30">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
                <div className="text-sm text-muted-foreground">{rangeText}</div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setQuery((q) => ({ ...q, currentPage: Math.max(1, q.currentPage - 1) }))
                    }
                    disabled={query.currentPage === 1 || isLoading}
                    className="bg-background"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm px-3 py-1 bg-muted/30 rounded border">
                    Page {query.currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setQuery((q) => ({
                        ...q,
                        currentPage: Math.min(totalPages, q.currentPage + 1),
                      }))
                    }
                    disabled={query.currentPage === totalPages || isLoading || totalPages === 0}
                    className="bg-background"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
