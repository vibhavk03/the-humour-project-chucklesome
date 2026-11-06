import { describe, expect, it } from 'vitest';
import type { CaptionJobDetail, CaptionJobTask } from '@/types/caption-job';
import { elapsed, isTerminal, stepState, summarizeJob, taskActivity } from './caption-jobs';

const now = Date.parse('2026-09-21T12:00:00Z');
const task = (overrides: Partial<CaptionJobTask> = {}): CaptionJobTask => ({
  id: 'task', image_id: 'image', humor_flavor_id: 98, humor_flavor_slug: 'test',
  caption_request_id: 1, llm_prompt_chain_id: 1, status: 'queued', attempts: 0,
  completed_steps: 0, total_steps: 3, caption_ids: [], error: null,
  created_at: '2026-09-21T11:59:00Z', updated_at: '2026-09-21T11:59:00Z',
  available_at: '2026-09-21T11:59:00Z', dispatched_at: null, lease_expires_at: null, steps: [], ...overrides,
});
const job = (tasks: CaptionJobTask[]): CaptionJobDetail => ({ id: 'job', user_id: null, client_id: 'client',
  created_at: '2026-09-21T11:59:00Z', study_id: null, study_image_set_id: null, tasks });

describe('caption job observability', () => {
  it.each([
    [[], 'queued'], [[task()], 'queued'], [[task({ status: 'running' })], 'running'],
    [[task({ attempts: 2 })], 'running'], [[task({ completed_steps: 1 })], 'running'],
    [[task({ status: 'completed' })], 'completed'], [[task({ status: 'failed' })], 'failed'],
    [[task({ status: 'completed' }), task({ status: 'failed' })], 'partially_completed'],
    [[task({ status: 'failed' }), task()], 'running'],
  ] as const)('summarizes task states %#', (tasks, status) => {
    expect(summarizeJob(job([...tasks]), now).status).toBe(status);
  });
  it('sums progress and exposes retries and expired leases separately', () => {
    const result = summarizeJob(job([
      task({ status: 'running', lease_expires_at: '2026-09-21T11:59:59Z', completed_steps: 1 }),
      task({ attempts: 2 }), task({ status: 'completed', completed_steps: 3, caption_ids: ['caption'], updated_at: '2026-09-21T12:00:00Z' }),
    ]), now);
    expect(result).toMatchObject({ task_count: 3, total_steps: 9, completed_steps: 4, expired_leases: 1,
      retrying_tasks: 1, caption_count: 1, updated_at: '2026-09-21T12:00:00Z' });
  });
  it('distinguishes scheduled retries, dispatch and expired worker leases', () => {
    expect(taskActivity(task({ attempts: 2, available_at: '2026-09-21T12:01:00Z' }), now)).toBe('Retry scheduled');
    expect(taskActivity(task({ attempts: 2 }), now)).toBe('Retry ready');
    expect(taskActivity(task(), now)).toBe('Waiting for dispatch');
    expect(taskActivity(task({ dispatched_at: '2026-09-21T11:59:01Z' }), now)).toContain('waiting for worker');
    expect(taskActivity(task({ status: 'running', lease_expires_at: '2026-09-21T12:00:00Z' }), now)).toContain('Lease expired');
    expect(taskActivity(task({ status: 'completed', attempts: 2 }), now)).toBe('Completed');
  });
  it('a failed step leaves later steps pending', () => {
    const failed = task({ status: 'failed', completed_steps: 1 });
    expect([1, 2, 3].map(n => stepState(failed, n))).toEqual(['Completed', 'Failed', 'Pending']);
    expect(stepState(task({ attempts: 1 }), 1)).toBe('Retry pending');
    expect(stepState(task({ status: 'running', lease_expires_at: '2026-09-21T11:59:59Z' }), 1, now)).toBe('Awaiting recovery');
  });
  it('stops elapsed time at terminal activity and tolerates invalid timestamps', () => {
    expect(isTerminal('partially_completed')).toBe(true);
    expect(isTerminal('running')).toBe(false);
    expect(elapsed('2026-09-21T11:59:00Z', now)).toBe('1m 0s');
    expect(elapsed('2026-09-21T11:59:00Z', '2026-09-21T11:59:44Z')).toBe('44s');
    expect(elapsed('2026-09-21T12:01:00Z', now)).toBe('0s');
    expect(elapsed('invalid', now)).toBe('—');
  });
});
