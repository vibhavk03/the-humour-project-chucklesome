'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { CaptionJobsService } from '@/services/caption-jobs.service';
import { useCaptionJobPolling } from '@/hooks/useCaptionJobPolling';
import { elapsed, isTerminal, stepState, summarizeJob, taskActivity } from '@/utils/caption-jobs';
import { JobError, JobOwner, JobProgress, JobRefresh, JobStatusBadge, useJobDate } from './JobUi';

export default function CaptionJobDetailsPage({ jobId }: { jobId: string }) {
  const load = useCallback((signal: AbortSignal) => CaptionJobsService.get(jobId, signal), [jobId]);
  const polling = useCaptionJobPolling(load);
  const { data: job, loading, error, updatedAt } = polling;
  const date = useJobDate();
  const summary = job ? summarizeJob(job, updatedAt) : null;

  return <div className="page-shell space-y-5">
    <Link className="text-sm text-primary underline underline-offset-2" href="/caption-jobs">← Caption Jobs</Link>
    <div className="page-header"><div><h1 className="page-title">Caption Job</h1><p className="mt-1 break-all font-mono text-sm text-muted-foreground">{jobId}</p></div>{summary && <JobStatusBadge status={summary.status} />}</div>
    <JobRefresh {...polling} />
    <JobError message={error} stale={!!job} />
    {!job && loading && <p className="animate-pulse py-8 text-muted-foreground">Loading job…</p>}
    {job === null && !error && <p className="rounded-lg border p-6">This caption job was not found.</p>}
    {job && summary && <>
      <Card className="animate-in fade-in-0 slide-in-from-bottom-2"><CardContent className="space-y-4 p-5">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="mb-1 text-xs text-muted-foreground">Pipeline progress</p><JobProgress completed={summary.completed_steps} total={summary.total_steps} /></div>
          <div><p className="text-xs text-muted-foreground">Tasks completed</p><p className="text-xl font-semibold">{summary.completed_tasks} / {summary.task_count}</p>{summary.failed_tasks > 0 && <p className="text-sm text-destructive">{summary.failed_tasks} failed</p>}</div>
          <div><p className="text-xs text-muted-foreground">Captions saved</p><p className="text-xl font-semibold">{summary.caption_count}</p></div>
          <div><p className="text-xs text-muted-foreground">Elapsed including queue time</p><p className="text-xl font-semibold tabular-nums">{elapsed(job.created_at, isTerminal(summary.status) ? summary.updated_at : updatedAt)}</p></div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm">
          <span>Created {date(job.created_at)}</span><span>Last activity {date(summary.updated_at)}</span>
          <JobOwner userId={job.user_id} clientId={job.client_id} />
          {job.study_id != null && <Link className="text-primary underline" href={`/study/${job.study_id}`}>Study {job.study_id}</Link>}
          {job.study_image_set_id != null && <Link className="text-primary underline" href={`/study-image-set/${job.study_image_set_id}`}>Image set {job.study_image_set_id}</Link>}
        </div>
        {summary.expired_leases > 0 && <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{summary.expired_leases} task(s) have expired worker leases and are awaiting automatic recovery.</p>}
      </CardContent></Card>
      <div><h2 className="text-lg font-semibold">Image and flavor tasks</h2><p className="text-sm text-muted-foreground">Expand a task for step progress, worker timing, errors, and generated captions.</p></div>
      {job.tasks.length === 0 && <p className="rounded-lg border p-5">No tasks are recorded for this job.</p>}
      {job.tasks.map(task => <details key={task.id} open={job.tasks.length === 1 || task.status === 'failed'} className="group rounded-xl border bg-card p-4 shadow-sm animate-in fade-in-0">
        <summary className="cursor-pointer space-y-2">
          <span className="ml-2 break-all font-mono text-xs">{task.id}</span>
          <span className="ml-3"><JobStatusBadge status={task.status} /></span>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 pl-5">
            <span className="text-sm font-medium">Flavor {task.humor_flavor_id} · {task.humor_flavor_slug ?? 'Unavailable'}</span>
            <span className="text-xs text-muted-foreground">{taskActivity(task, updatedAt)}</span>
            <JobProgress completed={task.completed_steps} total={task.total_steps} />
          </div>
        </summary>
        <div className="mt-4 space-y-4 border-t pt-4">
          <div className="flex flex-wrap gap-4 text-sm text-primary">
            <Link className="break-all underline" href={`/image/${task.image_id}`}>Image {task.image_id}</Link>
            <Link className="underline" href={`/humor-flavor/${task.humor_flavor_id}/steps`}>Flavor steps</Link>
            <Link className="underline" href={`/caption-request/${task.caption_request_id}`}>Request {task.caption_request_id}</Link>
            <Link className="underline" href={`/llm-prompt-chain/${task.llm_prompt_chain_id}`}>Prompt chain {task.llm_prompt_chain_id}</Link>
          </div>
          {task.error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><p className="font-semibold">{task.status === 'failed' ? 'Failure' : 'Last attempt error'}</p><p className="mt-1 whitespace-pre-wrap break-words text-destructive">{task.error}</p></div>}
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Attempts on current step', `${task.attempts} / 5`],
              ['Elapsed including queue time', elapsed(task.created_at, isTerminal(task.status) ? task.updated_at : updatedAt)],
              ['Last activity', date(task.updated_at)],
              ['Last dispatched', date(task.dispatched_at)],
              ['Next eligible to run', isTerminal(task.status) ? '—' : date(task.available_at)],
              ['Worker lease expires', date(task.lease_expires_at)],
            ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 tabular-nums">{value}</dd></div>)}
          </dl>
          <p className="text-xs text-muted-foreground">Attempts reset after each successful step. A completed checkpoint does not retain earlier retry counts. Lease expiry indicates when abandoned work can be recovered.</p>
          <div className="table-shell overflow-x-auto"><table className="table-base w-full text-sm">
            <thead className="table-head"><tr>{['Step', 'State', 'Type', 'Model', 'Provider'].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead>
            <tbody>{task.steps.map(step => <tr key={step.number} className="border-t"><td className="p-3">{step.number}{step.step_id != null && <span className="ml-2 text-xs text-muted-foreground">#{step.step_id}</span>}</td><td className="p-3">{stepState(task, step.number, updatedAt)}</td><td className="p-3">{step.type ?? '—'}</td><td className="p-3">{step.model ?? '—'}</td><td className="p-3">{step.provider ?? '—'}</td></tr>)}</tbody>
          </table></div>
          {task.caption_ids.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Generated captions</h3><ul className="space-y-1">{task.caption_ids.map(id => <li key={id}><Link className="break-all font-mono text-xs text-primary underline" href={`/caption/${id}`}>{id}</Link></li>)}</ul></div>}
        </div>
      </details>)}
    </>}
  </div>;
}
