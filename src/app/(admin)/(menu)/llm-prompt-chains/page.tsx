"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LlmPromptChainRow } from "@/types/llm-prompt-chain";
import { useTimeZone } from "@/components/TimeZoneContext";

type LlmPromptChainListItem = Pick<
  LlmPromptChainRow,
  "id" | "created_datetime_utc" | "caption_request_id"
>;

const ITEMS_PER_PAGE = 20;

const formatDateTime = (dateString: string, timeZone: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return {
      date: dateString,
      time: "",
      full: dateString,
    };
  }
  return {
    date: date.toLocaleDateString("en-US", { timeZone }),
    time: date.toLocaleTimeString("en-US", { timeZone, timeZoneName: "short" }),
    full: date.toLocaleString("en-US", { timeZone, timeZoneName: "short" }),
  };
};

export default function LlmPromptChainsPage() {
  const router = useRouter();
  const { timeZone } = useTimeZone();
  const [promptChains, setPromptChains] = useState<LlmPromptChainListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setCurrentPage(1);
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const searchFilters = useMemo(() => {
    if (!debouncedSearchQuery) return "";
    const numericId = Number(debouncedSearchQuery);
    if (Number.isNaN(numericId)) {
      return "id.eq.-1";
    }
    return `id.eq.${numericId},caption_request_id.eq.${numericId}`;
  }, [debouncedSearchQuery]);

  const fetchPromptChains = useCallback(async () => {
    if (!supabase) {
      setErrorMessage("Supabase client unavailable.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from("llm_prompt_chains")
        .select("id, created_datetime_utc, caption_request_id", { count: "exact" })
        .order("created_datetime_utc", { ascending: false })
        .range(from, to);

      if (searchFilters) {
        query = query.or(searchFilters);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error("Error fetching prompt chains:", error);
        setErrorMessage("Failed to load prompt chains.");
        setPromptChains([]);
        setTotalItems(0);
        return;
      }

      setPromptChains(data || []);
      setTotalItems(count || 0);
    } catch (error) {
      console.error("Error fetching prompt chains:", error);
      setErrorMessage("Failed to load prompt chains.");
      setPromptChains([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchFilters]);

  useEffect(() => {
    fetchPromptChains();
  }, [fetchPromptChains]);

  const totalPages = useMemo(
    () => Math.ceil(totalItems / ITEMS_PER_PAGE),
    [totalItems]
  );

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    for (let i = startPage; i <= endPage; i += 1) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  const handleRowClick = (id: number) => {
    router.push(`/llm-prompt-chain/${id}`);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">LLM Prompt Chains</h1>
        <p className="page-subtitle">
          Review prompt chains and jump into their generated outputs.
        </p>
      </div>

      <div className="mb-4">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search by prompt chain ID or caption request ID"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-10 pr-10 bg-background border-border"
            disabled={loading}
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="text-sm text-destructive">{errorMessage}</div>
      ) : null}

      <div className="table-shell animate-in fade-in-0">
        <table className="w-full table-base table-fixed">
          <thead className="table-head">
            <tr>
              <th className="w-24">Id</th>
              <th className="w-48">Created</th>
              <th className="w-48">Caption Request</th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={3} className="text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : promptChains.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-muted-foreground">
                  No prompt chains found
                </td>
              </tr>
            ) : (
              promptChains.map((chain) => {
                const created = formatDateTime(chain.created_datetime_utc, timeZone);
                return (
                  <tr
                    key={chain.id}
                    className="h-14 cursor-pointer hover:bg-muted/60"
                    onClick={() => handleRowClick(chain.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleRowClick(chain.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`View prompt chain ${chain.id}`}
                  >
                    <td className="font-sans">
                      <div className="truncate" title={String(chain.id)}>
                        {chain.id}
                      </div>
                    </td>
                    <td>
                      <div className="truncate" title={created.full}>
                        {created.date} {created.time}
                      </div>
                    </td>
                    <td>
                      <div className="truncate" title={String(chain.caption_request_id)}>
                        {chain.caption_request_id}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalItems)}{" "}
          to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} prompt
          chains
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1 || loading}
          >
            Previous
          </Button>
          {pageNumbers.map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentPage(page)}
              disabled={loading}
            >
              {page}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || loading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
