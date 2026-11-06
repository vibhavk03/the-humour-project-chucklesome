import type { CaptionJobDetail, CaptionJobSummary, CaptionJobTask, JobStatus } from '@/types/caption-job';

export const isJobId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Queued', running: 'Running', completed: 'Completed',
  partially_completed: 'Partially completed', failed: 'Failed',
};
export const isTerminal = (status: JobStatus) =>
  status === 'completed' || status === 'failed' || status === 'partially_completed';

export function summarizeJob(job: CaptionJobDetail, now = Date.now()): CaptionJobSummary {
  const tasks = job.tasks;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const status: JobStatus = tasks.length > 0 && completed + failed === tasks.length
    ? failed === 0 ? 'completed' : completed === 0 ? 'failed' : 'partially_completed'
    : tasks.some(t => t.status !== 'queued' || t.completed_steps > 0 || t.attempts > 0) ? 'running' : 'queued';
  return {
    id: job.id, user_id: job.user_id, client_id: job.client_id, created_at: job.created_at,
    updated_at: tasks.reduce((latest, t) => Date.parse(t.updated_at) > Date.parse(latest) ? t.updated_at : latest, job.created_at),
    status, task_count: tasks.length, completed_tasks: completed, failed_tasks: failed,
    completed_steps: tasks.reduce((n, t) => n + t.completed_steps, 0),
    total_steps: tasks.reduce((n, t) => n + t.total_steps, 0),
    caption_count: tasks.reduce((n, t) => n + t.caption_ids.length, 0),
    expired_leases: tasks.filter(t => t.status === 'running' && t.lease_expires_at && Date.parse(t.lease_expires_at) <= now).length,
    retrying_tasks: tasks.filter(t => t.status === 'queued' && t.attempts > 0).length,
  };
}

export function taskActivity(task: CaptionJobTask, now = Date.now()) {
  if (task.status === 'completed') return 'Completed';
  if (task.status === 'failed') return 'Failed';
  if (task.status === 'running') {
    return task.lease_expires_at && Date.parse(task.lease_expires_at) <= now
      ? 'Lease expired · awaiting recovery' : 'Worker running';
  }
  if (Date.parse(task.available_at) > now) return task.attempts > 0 ? 'Retry scheduled' : 'Scheduled';
  if (task.attempts > 0) return 'Retry ready';
  return task.dispatched_at ? 'Dispatched · waiting for worker' : 'Waiting for dispatch';
}

export function stepState(task: CaptionJobTask, number: number, now = Date.now()) {
  if (number <= task.completed_steps) return 'Completed';
  if (number !== task.completed_steps + 1) return 'Pending';
  if (task.status === 'failed') return 'Failed';
  if (task.status === 'running') return task.lease_expires_at && Date.parse(task.lease_expires_at) <= now ? 'Awaiting recovery' : 'In progress';
  if (task.attempts > 0) return 'Retry pending';
  return 'Pending';
}

export function elapsed(start: string, end: string | number = Date.now()) {
  const ms = (typeof end === 'number' ? end : Date.parse(end)) - Date.parse(start);
  if (!Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
}
