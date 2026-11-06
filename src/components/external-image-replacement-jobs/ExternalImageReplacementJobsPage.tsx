'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  JobError,
  JobRefresh,
  JobStatusBadge,
  useJobDate,
} from '@/components/caption-jobs/JobUi'
import { useCaptionJobPolling } from '@/hooks/useCaptionJobPolling'
import { useToast } from '@/hooks/use-toast'
import { ExternalImageReplacementJobsService } from '@/services/external-image-replacement-jobs.service'
import {
  IMAGE_REPLACEMENT_STATUSES,
  type ImageReplacementStatus,
} from '@/types/external-image-replacement-job'

const labels = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
}
function sourceLink(url: string) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : undefined
  } catch {
    return undefined
  }
}

export default function ExternalImageReplacementJobsPage() {
  const search = useSearchParams()
  const router = useRouter()
  const status =
    IMAGE_REPLACEMENT_STATUSES.find(
      (value) => value === search.get('status')
    ) ?? ''
  const mine = search.get('mine') === 'true'
  const requestedOffset = Number(search.get('offset') ?? 0)
  const offset =
    Number.isSafeInteger(requestedOffset) &&
    requestedOffset >= 0 &&
    requestedOffset <= 1_000_000
      ? requestedOffset
      : 0
  const updateFilters = (next: {
    status?: ImageReplacementStatus | ''
    mine?: boolean
    offset?: number
  }) => {
    const query = new URLSearchParams({
      mine: String(next.mine ?? mine),
      offset: String(next.offset ?? 0),
    })
    const nextStatus = next.status ?? status
    if (nextStatus) query.set('status', nextStatus)
    router.replace(`/external-image-replacement-jobs?${query}`, {
      scroll: false,
    })
  }
  const [retrying, setRetrying] = useState<string | null>(null)
  const { toast } = useToast()
  const load = useCallback(
    (signal: AbortSignal) =>
      ExternalImageReplacementJobsService.list(
        { status, mine, offset },
        signal
      ),
    [status, mine, offset]
  )
  const polling = useCaptionJobPolling(load)
  const { data, loading, error } = polling
  const date = useJobDate()
  const retry = async (id: string) => {
    if (retrying) return
    setRetrying(id)
    try {
      const result = await ExternalImageReplacementJobsService.retry(id)
      polling.refresh()
      toast({
        title: result.queued
          ? 'Image replacement queued'
          : 'Job status updated',
      })
    } catch (error) {
      toast({
        title: 'Could not retry image replacement',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    } finally {
      setRetrying(null)
    }
  }

  return (
    <div className="page-shell space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">External Image Replacement Jobs</h1>
          <p className="page-subtitle">
            Follow image replacements while saved captions and studies remain
            available.
          </p>
        </div>
      </div>
      <JobRefresh {...polling} />
      <JobError message={error} stale={!!data} />
      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="space-y-5 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1 text-sm">
              Status
              <select
                className="block h-10 rounded-md border bg-background px-3"
                value={status}
                onChange={(event) => {
                  updateFilters({
                    status: event.target.value as ImageReplacementStatus | '',
                  })
                }}
              >
                <option value="">All statuses</option>
                {IMAGE_REPLACEMENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {labels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Owner
              <select
                className="block h-10 rounded-md border bg-background px-3"
                value={mine ? 'mine' : 'all'}
                onChange={(event) => {
                  updateFilters({ mine: event.target.value === 'mine' })
                }}
              >
                <option value="all">All users</option>
                <option value="mine">My jobs</option>
              </select>
            </label>
          </div>
          <div
            className="grid grid-cols-2 gap-2 md:grid-cols-5"
            aria-label="Image replacement job counts"
          >
            {(['total', ...IMAGE_REPLACEMENT_STATUSES] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === (value === 'total' ? '' : value)}
                  onClick={() => {
                    updateFilters({ status: value === 'total' ? '' : value })
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted ${status === (value === 'total' ? '' : value) ? 'border-primary bg-primary/5' : ''}`}
                >
                  <span className="block text-xs text-muted-foreground">
                    {value === 'total' ? 'All jobs' : labels[value]}
                  </span>
                  <span className="mt-1 block text-2xl font-semibold tabular-nums">
                    {data?.counts[value] ?? '—'}
                  </span>
                </button>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            One job per distinct source URL in an import. Failed replacements
            keep the original URL; retrying preserves image and caption IDs.
          </p>
          <div className="table-shell overflow-x-auto" aria-busy={loading}>
            <table className="table-base w-full text-sm">
              <thead className="table-head">
                <tr>
                  {[
                    'Id',
                    'Status',
                    'Image',
                    'Source URL',
                    'Attempts',
                    'Timing',
                    'Error / Result',
                    'Owner',
                    'Actions',
                  ].map((title) => (
                    <th key={title} className="p-3 text-left">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!data && loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="animate-pulse p-8 text-center text-muted-foreground"
                    >
                      Loading jobs…
                    </td>
                  </tr>
                ) : null}
                {!data && !loading && error ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="p-8 text-center text-muted-foreground"
                    >
                      Jobs could not be loaded.
                    </td>
                  </tr>
                ) : null}
                {data?.jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-t align-top hover:bg-muted/40"
                  >
                    <td className="max-w-48 break-all p-3 font-mono text-xs">
                      {job.id}
                    </td>
                    <td className="p-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="max-w-52 space-y-2 break-all p-3 text-xs">
                      <Link
                        className="text-primary underline"
                        href={`/image/${job.image_id}`}
                      >
                        {job.image_id}
                      </Link>
                      {job.image_url && sourceLink(job.image_url) ? (
                        <a
                          className="block text-primary underline"
                          href={job.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View current image
                        </a>
                      ) : null}
                    </td>
                    <td className="max-w-72 break-all p-3 text-xs">
                      <a
                        href={sourceLink(job.source_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        {job.source_url}
                      </a>
                    </td>
                    <td className="p-3 tabular-nums">{job.attempts} / 5</td>
                    <td className="min-w-48 space-y-1 p-3 text-xs">
                      <p>Created {date(job.created_at)}</p>
                      <p>Updated {date(job.updated_at)}</p>
                      {job.status === 'queued' && job.attempts > 0 ? (
                        <p>Retry after {date(job.available_at)}</p>
                      ) : null}
                      {job.status === 'running' ? (
                        <p>Lease ends {date(job.lease_expires_at)}</p>
                      ) : null}
                    </td>
                    <td className="max-w-64 break-words p-3 text-xs">
                      {job.error ? (
                        <span className="text-destructive">{job.error}</span>
                      ) : job.replacement_result === 'image_deleted' ? (
                        'Image was deleted'
                      ) : job.replacement_result === 'superseded' ? (
                        'Image URL changed; queued replacement skipped'
                      ) : job.replacement_result === 'replaced' ? (
                        'Hosted image saved'
                      ) : job.replacement_result === 'reused' ? (
                        'Reused existing uploaded image'
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-40 break-all p-3 text-xs">
                      <Link
                        className="text-primary underline"
                        href={`/user/${job.user_id}/images`}
                      >
                        {job.user_id}
                      </Link>
                    </td>
                    <td className="p-3">
                      {job.status === 'failed' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!job.can_retry || retrying !== null}
                          title={
                            job.can_retry
                              ? 'Retry this image replacement'
                              : 'Only the importing user can retry this job'
                          }
                          onClick={() => void retry(job.id)}
                        >
                          {retrying === job.id ? 'Queuing…' : 'Retry'}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {data?.jobs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No image replacement jobs match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              {data
                ? `${data.filteredCount === 0 ? 0 : Math.min(offset + 1, data.filteredCount)}–${Math.min(offset + 25, data.filteredCount)} of ${data.filteredCount} jobs`
                : '—'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() =>
                  updateFilters({ offset: Math.max(0, offset - 25) })
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={loading || !data || offset + 25 >= data.filteredCount}
                onClick={() => updateFilters({ offset: offset + 25 })}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
