'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Search, X } from 'lucide-react'
import type { LlmResponse } from '@/types/llm-response'
import { useTimeZone } from '@/components/TimeZoneContext'

type LlmResponseListItem = Pick<
  LlmResponse,
  | 'id'
  | 'created_datetime_utc'
  | 'llm_model_id'
  | 'caption_request_id'
  | 'profile_id'
  | 'humor_flavor_id'
  | 'processing_time_seconds'
  | 'llm_model_response'
> &
  Partial<Pick<LlmResponse, 'llm_system_prompt' | 'llm_user_prompt' | 'llm_temperature'>>

export default function LlmResponses() {
  const { timeZone } = useTimeZone()
  const [llmResponses, setLlmResponses] = useState<LlmResponseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<LlmResponseListItem | null>(
    null
  )
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const latestDetailsRequestId = useRef<string | null>(null)
  const ITEMS_PER_PAGE = 10

  const formatDateTime = useCallback(
    (dateString: string) => {
      const date = new Date(dateString)
      return {
        date: date.toLocaleDateString('en-US', { timeZone }),
        time: date.toLocaleTimeString('en-US', {
          timeZone,
          timeZoneName: 'short',
        }),
        full: date.toLocaleString('en-US', {
          timeZone,
          timeZoneName: 'short',
        }),
      }
    },
    [timeZone]
  )

  useEffect(() => {
    const timeout = setTimeout(() => {
      setCurrentPage(1)
      setDebouncedSearchQuery(searchQuery.trim())
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchQuery])

  const searchFilters = useMemo(() => {
    if (!debouncedSearchQuery) return ''
    const pattern = `%${debouncedSearchQuery}%`
    const filters = [
      `llm_model_response.ilike.${pattern}`,
      `llm_system_prompt.ilike.${pattern}`,
      `llm_user_prompt.ilike.${pattern}`,
    ]
    const numericId = Number(debouncedSearchQuery)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!Number.isNaN(numericId)) {
      filters.push(`llm_model_id.eq.${numericId}`)
      filters.push(`caption_request_id.eq.${numericId}`)
      filters.push(`humor_flavor_id.eq.${numericId}`)
      filters.push(`processing_time_seconds.eq.${numericId}`)
    }
    if (uuidRegex.test(debouncedSearchQuery)) {
      filters.push(`id.eq.${debouncedSearchQuery}`)
      filters.push(`profile_id.eq.${debouncedSearchQuery}`)
    }
    return filters.join(',')
  }, [debouncedSearchQuery])

  const fetchLlmResponses = useCallback(async () => {
    if (!supabase) return

    try {
      setLoading(true)

      // range for pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      // Fetch paginated data with count in a single query
      let query = supabase
        .from('llm_model_responses')
        .select(
          `
          id,
          created_datetime_utc,
          llm_model_id,
          caption_request_id,
          profile_id,
          humor_flavor_id,
          processing_time_seconds,
          llm_model_response
        `,
          { count: 'exact' }
        )
        .order('created_datetime_utc', { ascending: false })
        .range(from, to)

      if (searchFilters) {
        query = query.or(searchFilters)
      }

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching LLM responses:', error)
        return
      }
      setTotalItems(count || 0)
      setLlmResponses(data || [])
    } catch (error) {
      console.log('Error:', error)
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchFilters])

  useEffect(() => {
    fetchLlmResponses()
  }, [fetchLlmResponses])

  const fetchResponseDetails = useCallback(async (responseId: string) => {
    if (!supabase) return

    latestDetailsRequestId.current = responseId
    try {
      const { data, error } = await supabase
        .from('llm_model_responses')
        .select(
          `
          id,
          created_datetime_utc,
          llm_model_id,
          caption_request_id,
          profile_id,
          humor_flavor_id,
          processing_time_seconds,
          llm_model_response,
          llm_system_prompt,
          llm_user_prompt,
          llm_temperature
        `
        )
        .eq('id', responseId)
        .single()

      if (error) {
        console.error('Error fetching LLM response details:', error)
        return
      }

      if (latestDetailsRequestId.current === responseId) {
        setSelectedResponse(data)
      }
    } catch (error) {
      console.log('Error:', error)
    } finally {
      if (latestDetailsRequestId.current === responseId) {
        latestDetailsRequestId.current = null
      }
    }
  }, [])

  const handleResponseSelect = useCallback(
    (response: LlmResponseListItem) => {
      setSelectedResponse(response)
      setIsDetailOpen(true)
      fetchResponseDetails(response.id)
    },
    [fetchResponseDetails]
  )

  const handleDetailOpenChange = (open: boolean) => {
    setIsDetailOpen(open)
    if (!open) {
      setSelectedResponse(null)
    }
  }

  // Calc total # pages
  const totalPages = useMemo(
    () => Math.ceil(totalItems / ITEMS_PER_PAGE),
    [totalItems]
  )

  // Page navigation
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1)
    }
  }

  const handlePageClick = (page: number) => {
    setCurrentPage(page)
  }

  const truncateId = (id: string) => {
    const idString = id
    if (idString.length <= 8) return idString
    return `${idString.slice(0, 8)}...`
  }

  const pageNumbers = useMemo(() => {
    const pages = []
    const maxPagesToShow = 5 // show 5 pages display
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2))
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1)

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }
    return pages
  }, [currentPage, totalPages])

  const thClassName = 'text-left'
  const tdClassName = 'whitespace-nowrap'
  const label = 'text-sm font-medium text-muted-foreground'

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">LLM Responses</h1>
        <p className="page-subtitle">
          Review model responses and processing details.
        </p>
      </div>
      <div className="mb-4">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search responses, prompts, or IDs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
            disabled={loading}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="table-shell">
        <div>
          <table className="w-full table-base table-fixed">
            <thead className="table-head">
              <tr>
                <th className={`w-12 ${thClassName}`}>ID</th>
                <th className={`w-36 ${thClassName}`}>Created</th>
                <th className={`w-20 ${thClassName}`}>Model ID</th>
                <th className={`w-28 ${thClassName}`}>Caption Req</th>
                <th className={`w-28 ${thClassName}`}>Profile</th>
                <th className={`w-20 ${thClassName}`}>Flavor ID</th>
                <th className={`w-56 ${thClassName}`}>Response</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : llmResponses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    No LLM responses found
                  </td>
                </tr>
              ) : (
                llmResponses.map((response) => {
                  const createdDateTime = formatDateTime(
                    response.created_datetime_utc
                  )

                  return (
                    <tr
                      key={response.id}
                      className="h-16 cursor-pointer hover:bg-muted/60"
                      onClick={() => handleResponseSelect(response)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleResponseSelect(response)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`View response ${response.id}`}
                    >
                      <td className="whitespace-nowrap font-sans h-16">
                        <div
                          className="truncate"
                          title={response.id.toString()}
                        >
                          {truncateId(response.id)}
                        </div>{' '}
                      </td>
                      <td className={`${tdClassName}`}>
                        <div className="truncate" title={createdDateTime.full}>
                          {createdDateTime.date} {createdDateTime.time}
                        </div>
                      </td>
                      <td className={`${tdClassName}`}>
                        <div
                          className="truncate"
                          title={String(response.llm_model_id)}
                        >
                          {response.llm_model_id}
                        </div>
                      </td>
                      <td className={`${tdClassName}`}>
                        <div
                          className="truncate"
                          title={String(response.caption_request_id)}
                        >
                          {response.caption_request_id}
                        </div>
                      </td>
                      <td className={`${tdClassName}`}>
                        <div
                          className="truncate"
                          title={response.profile_id ?? undefined}
                        >
                          {response.profile_id
                            ? truncateId(response.profile_id)
                            : "—"}
                        </div>
                      </td>
                      <td className={`${tdClassName}`}>
                        <div
                          className="truncate"
                          title={String(response.humor_flavor_id)}
                        >
                          {response.humor_flavor_id}
                        </div>
                      </td>
                      <td className={`${tdClassName}`}>
                        <div
                          className="truncate"
                          title={response.llm_model_response ?? '—'}
                        >
                          {response.llm_model_response ?? '—'}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog open={isDetailOpen} onOpenChange={handleDetailOpenChange}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>LLM Response Details:</DialogTitle>
          </DialogHeader>
          {selectedResponse ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  ID:
                </label>
                <p className="text-sm font-sans">{selectedResponse.id}</p>
              </div>
              <div>
                <label className={`${label}`}>Created:</label>
                <p className="text-sm">
                  {formatDateTime(selectedResponse.created_datetime_utc).full}
                </p>
              </div>
              <div>
                <label className={`${label}`}>Model ID:</label>
                <p className="text-sm">{selectedResponse.llm_model_id}</p>
              </div>
              <div>
                <label className={`${label}`}>Caption Request ID:</label>
                <p className="text-sm">{selectedResponse.caption_request_id}</p>
              </div>
              <div>
                <label className={`${label}`}>Profile ID:</label>
                <p className="text-sm font-sans">{selectedResponse.profile_id}</p>
              </div>
              <div>
                <label className={`${label}`}>Humor Flavor ID:</label>
                <p className="text-sm">{selectedResponse.humor_flavor_id}</p>
              </div>
              <div>
                <label className={`${label}`}>Processing Time (s):</label>
                <p className="text-sm">{selectedResponse.processing_time_seconds}</p>
              </div>
              <div>
                <label className={`${label}`}>Temperature:</label>
                <p className="text-sm">
                  {selectedResponse.llm_temperature ?? "—"}
                </p>
              </div>
              <div>
                <label className={`${label}`}>System Prompt:</label>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedResponse.llm_system_prompt}
                </p>
              </div>
              <div>
                <label className={`${label}`}>User Prompt:</label>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedResponse.llm_user_prompt}
                </p>
              </div>
              <div>
                <label className={`${label}`}>Response:</label>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedResponse.llm_model_response ?? "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Loading response details...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalItems)}{' '}
          to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of{' '}
          {totalItems} responses
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          {pageNumbers.map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePageClick(page)}
            >
              {page}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
