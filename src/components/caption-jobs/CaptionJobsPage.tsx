'use client';

import { useCallback, useState } from 'react';
import { useDebounce } from 'use-debounce';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CaptionJobsService } from '@/services/caption-jobs.service';
import { useCaptionJobPolling } from '@/hooks/useCaptionJobPolling';
import { JOB_STATUSES, type JobStatus } from '@/types/caption-job';
import { elapsed, isJobId, isTerminal, STATUS_LABELS } from '@/utils/caption-jobs';
import { JobError, JobOwner, JobProgress, JobRefresh, JobStatusBadge, useJobDate } from './JobUi';

export default function CaptionJobsPage() {
  const [filters, setFilters] = useState<{ search: string; status: JobStatus | ''; days: number }>({ search: '', status: '', days: 7 });
  const [offset, setOffset] = useState(0);
  const [search] = useDebounce(filters.search.trim(), 300);
  const { days, status } = filters;
  const load = useCallback((signal: AbortSignal) => CaptionJobsService.list({ days, status, search, offset }, signal), [days, status, search, offset]);
  const polling = useCaptionJobPolling(load);
  const { data, loading, error, updatedAt } = polling;
  const date = useJobDate();
  const update = (next: Partial<typeof filters>) => { setFilters(previous => ({ ...previous, ...next })); setOffset(0); };

  return <div className="page-shell space-y-5">
    <div className="page-header"><div><h1 className="page-title">Caption Jobs</h1><p className="page-subtitle">Follow caption generation from queue to completion.</p></div></div>
    <JobRefresh {...polling} />
    <JobError message={error} stale={!!data} />
    <Card className="animate-in fade-in-0 slide-in-from-bottom-2"><CardContent className="space-y-5 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 space-y-1 text-sm">Search jobs
          <Input value={filters.search} maxLength={200} placeholder="Job, user or image ID · client · flavor ID or slug" onChange={event => update({ search: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm">Created
          <select className="block h-10 rounded-md border bg-background px-3" value={filters.days} onChange={event => update({ days: Number(event.target.value) })}>
            <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">Status
          <select className="block h-10 rounded-md border bg-background px-3" value={filters.status} onChange={event => update({ status: event.target.value as JobStatus | '' })}>
            <option value="">All statuses</option>{JOB_STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6" aria-label="Job counts for this time range and search">
        {(['total', ...JOB_STATUSES] as const).map(status => <button key={status} type="button"
          onClick={() => update({ status: status === 'total' ? '' : status })}
          aria-pressed={filters.status === (status === 'total' ? '' : status)}
          className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted ${filters.status === (status === 'total' ? '' : status) ? 'border-primary bg-primary/5' : ''}`}>
          <span className="block text-xs text-muted-foreground">{status === 'total' ? 'All jobs' : STATUS_LABELS[status]}</span>
          <span className="mt-1 block text-2xl font-semibold tabular-nums">{data?.counts[status] ?? '—'}</span>
        </button>)}
      </div>
      <p className="text-xs text-muted-foreground">Counts reflect the selected creation period and search. Paste a full job ID to open it outside this time range.</p>
      {isJobId(search) && <Link className="inline-block break-all text-sm text-primary underline" href={`/caption-job/${search}`}>Open job {search}</Link>}
      <div className="table-shell overflow-x-auto" aria-busy={loading}>
        <table className="table-base w-full text-sm">
          <thead className="table-head"><tr>{['Id', 'Status', 'Progress', 'Tasks', 'Captions', 'Owner', 'Elapsed', 'Created'].map(title => <th key={title} className="p-3 text-left">{title}</th>)}</tr></thead>
          <tbody>
            {!data && loading && <tr><td colSpan={8} className="animate-pulse p-8 text-center text-muted-foreground">Loading jobs…</td></tr>}
            {!data && !loading && error && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Jobs could not be loaded.</td></tr>}
            {data?.jobs.map(job => <tr key={job.id} className="border-t align-top hover:bg-muted/40">
              <td className="p-3"><Link href={`/caption-job/${job.id}`} className="block max-w-52 break-all font-mono text-xs text-primary underline underline-offset-2">{job.id}</Link></td>
              <td className="space-y-1 p-3"><JobStatusBadge status={job.status} />
                {job.expired_leases > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{job.expired_leases} expired lease(s)</p>}
                {job.retrying_tasks > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{job.retrying_tasks} retrying task(s)</p>}
              </td>
              <td className="p-3"><JobProgress completed={job.completed_steps} total={job.total_steps} /></td>
              <td className="whitespace-nowrap p-3">{job.completed_tasks} / {job.task_count} completed{job.failed_tasks > 0 && <p className="text-xs text-destructive">{job.failed_tasks} failed</p>}</td>
              <td className="p-3 tabular-nums">{job.caption_count}</td>
              <td className="max-w-44 p-3"><JobOwner userId={job.user_id} clientId={job.client_id} /></td>
              <td className="whitespace-nowrap p-3 tabular-nums">{elapsed(job.created_at, isTerminal(job.status) ? job.updated_at : updatedAt)}</td>
              <td className="whitespace-nowrap p-3 text-xs">{date(job.created_at)}</td>
            </tr>)}
            {data?.jobs.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No jobs match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{data ? `${data.filtered_count === 0 ? 0 : Math.min(offset + 1, data.filtered_count)}–${Math.min(offset + 25, data.filtered_count)} of ${data.filtered_count} jobs` : error ? 'Unavailable' : 'Loading…'}</span>
        <div className="flex gap-2"><Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 25))}>Previous</Button>
          <Button variant="outline" disabled={loading || !data || offset + 25 >= data.filtered_count} onClick={() => setOffset(value => value + 25)}>Next</Button></div>
      </div>
    </CardContent></Card>
  </div>;
}
