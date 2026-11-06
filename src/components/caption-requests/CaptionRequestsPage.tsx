"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { CaptionRequestsService } from "@/services/caption-requests.service";
import type { CaptionRequestListItem } from "@/types/caption-request";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTimeZone } from "@/components/TimeZoneContext";

const ITEMS_PER_PAGE = 10;

const formatDateTime = (value: string | null | undefined, timeZone: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
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

const formatProfileName = (request: CaptionRequestListItem) => {
  const first = request.profiles?.first_name?.trim();
  const last = request.profiles?.last_name?.trim();
  const name = [first, last].filter(Boolean).join(" ");
  return name || "Unknown User";
};

export default function CaptionRequestsPage() {
  const router = useRouter();
  const { timeZone } = useTimeZone();
  const [requests, setRequests] = useState<CaptionRequestListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
      setCurrentPage(1);
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const { requests: rows, totalCount: count } =
        await CaptionRequestsService.searchCaptionRequests({
          searchQuery: debouncedSearchQuery,
          offset,
          limit: ITEMS_PER_PAGE,
        });
      setRequests(rows);
      setTotalCount(count);
    } catch (error) {
      console.error("Error fetching caption requests:", error);
      setRequests([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const totalPages = useMemo(
    () => Math.max(Math.ceil(totalCount / ITEMS_PER_PAGE), 1),
    [totalCount]
  );

  const rangeText = useMemo(() => {
    if (!totalCount) return "No caption requests found";
    return `${totalCount.toLocaleString()} Total Caption Requests`;
  }, [totalCount]);

  const clearSearch = () => setSearchQuery("");

  const handleRowClick = (id: number) => {
    router.push(`/caption-request/${id}`);
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Caption Requests</h1>
        <p className="page-subtitle">Review requests submitted for caption generation.</p>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by request ID, image ID, or profile ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 bg-background border-border"
              />
              {isLoading && searchQuery ? (
                <div className="absolute right-10 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : null}
              {searchQuery && !isLoading ? (
                <button
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="table-shell">
            <table className="w-full table-base table-fixed">
              <thead className="table-head">
                <tr>
                  <th className="w-20">Id</th>
                  <th className="w-24">Image</th>
                  <th>User</th>
                  <th className="w-56">Created</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td>
                        <div className="h-3 bg-muted rounded w-12" />
                      </td>
                      <td>
                        <div className="h-10 w-10 rounded-md bg-muted" />
                      </td>
                      <td>
                        <div className="h-3 bg-muted rounded w-28" />
                      </td>
                      <td>
                        <div className="h-3 bg-muted rounded w-36" />
                      </td>
                    </tr>
                  ))
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      No caption requests found.
                    </td>
                  </tr>
                ) : (
                  requests.map((request) => (
                    <tr
                      key={request.id}
                      className="h-14 cursor-pointer hover:bg-muted/60"
                      onClick={() => handleRowClick(request.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleRowClick(request.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`View caption request ${request.id}`}
                    >
                      <td className="font-medium">{request.id}</td>
                      <td>
                        {request.images?.url ? (
                          <img
                            src={request.images.url}
                            alt="Request image thumbnail"
                            className="h-10 w-10 rounded-md border border-border/60 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md border border-dashed border-border/60 bg-muted/30" />
                        )}
                      </td>
                      <td>
                        <div className="truncate" title={formatProfileName(request)}>
                          {formatProfileName(request)}
                        </div>
                      </td>
                      <td className="text-muted-foreground">
                        <div
                          className="truncate"
                          title={formatDateTime(request.created_datetime_utc, timeZone)}
                        >
                          {formatDateTime(request.created_datetime_utc, timeZone)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Card className="border-l-4 border-l-primary/30">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
              <div className="text-sm text-muted-foreground">{rangeText}</div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || isLoading}
                  className="bg-background"
                >
                  Previous
                </Button>
                <span className="text-sm px-3 py-1 bg-muted/30 rounded border">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages || isLoading || totalPages === 0}
                  className="bg-background"
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
