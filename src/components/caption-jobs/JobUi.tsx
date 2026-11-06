'use client';

import Link from 'next/link';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTimeZone } from '@/components/TimeZoneContext';
import type { JobStatus } from '@/types/caption-job';
import { STATUS_LABELS } from '@/utils/caption-jobs';

const statusColors: Record<JobStatus, string> = {
  queued: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  partially_completed: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};
export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[status]}`}>
    {status === 'running' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
    {STATUS_LABELS[status]}
  </span>;
}
export function JobProgress({ completed, total }: { completed: number; total: number }) {
  return <div className="min-w-28 space-y-1">
    <span className="text-sm tabular-nums">{completed} / {total} steps</span>
    <progress className="block h-1.5 w-full accent-primary" aria-label="Completed pipeline steps" value={completed} max={Math.max(total, 1)} />
  </div>;
}
export function useJobDate() {
  const { timeZone } = useTimeZone();
  return (value: string | number | null | undefined) => value == null ? '—' : new Date(value).toLocaleString('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'medium' });
}
export function JobRefresh({ loading, live, setLive, refresh, updatedAt }: {
  loading: boolean; live: boolean; setLive: (live: boolean) => void; refresh: () => void; updatedAt?: number;
}) {
  const date = useJobDate();
  return <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs text-muted-foreground" role="status">{updatedAt ? `Updated ${date(updatedAt)}` : 'Waiting for data'} · {live ? 'Refreshes every 5s' : 'Paused'}</span>
    <Button variant="outline" size="sm" onClick={() => setLive(!live)} aria-pressed={live}>
      {live ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}{live ? 'Pause' : 'Resume'}
    </Button>
    <Button variant="outline" size="sm" disabled={loading} onClick={refresh}>
      <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
    </Button>
  </div>;
}
export function JobOwner({ userId, clientId }: { userId: string | null; clientId: string | null }) {
  return userId ? <span className="break-all text-xs">User {userId}</span>
    : <Link className="break-all text-sm text-primary underline underline-offset-2" href="/clients">Client {clientId ?? 'unknown'}</Link>;
}
export function JobError({ message, stale }: { message?: string; stale: boolean }) {
  return message ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
    {message}{stale && <p className="mt-1">Showing the last successful response. Data may be out of date.</p>}
  </div> : null;
}
