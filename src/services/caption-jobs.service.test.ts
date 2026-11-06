import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock('@/utils/supabase/client', () => ({ supabase: { rpc } }));
import { CaptionJobsService } from './caption-jobs.service';

beforeEach(() => { vi.resetAllMocks(); rpc.mockReturnValue({ abortSignal }); });
describe('CaptionJobsService', () => {
  it('uses the JWT client read RPC with bounded pagination and cancellation', async () => {
    abortSignal.mockResolvedValue({ data: { jobs: [] }, error: null });
    const signal = new AbortController().signal;
    await CaptionJobsService.list({ days: 7, status: '', search: '98', offset: 25 }, signal);
    expect(rpc).toHaveBeenCalledWith('admin_list_caption_jobs', expect.objectContaining({ p_search: '98', p_limit: 25, p_offset: 25, p_status: undefined }));
    expect(abortSignal).toHaveBeenCalledWith(signal);
  });
  it('normalizes pasted uppercase UUIDs for database search', async () => {
    abortSignal.mockResolvedValue({ data: { jobs: [] }, error: null });
    await CaptionJobsService.list({ days: 7, status: '', search: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', offset: 0 }, new AbortController().signal);
    expect(rpc).toHaveBeenCalledWith('admin_list_caption_jobs', expect.objectContaining({ p_search: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }));
  });
  it('does not hide permission failures as an empty list', async () => {
    abortSignal.mockResolvedValue({ data: null, error: { code: '42501', message: 'forbidden' } });
    await expect(CaptionJobsService.list({ days: 1, status: 'failed', search: '', offset: 0 }, new AbortController().signal)).rejects.toThrow('Superadmin access');
  });
  it('explains a missing database migration', async () => {
    abortSignal.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await expect(CaptionJobsService.get('00000000-0000-0000-0000-000000000001', new AbortController().signal)).rejects.toThrow('migration');
  });
  it('rejects invalid IDs without a request and preserves a not-found response', async () => {
    await expect(CaptionJobsService.get('bad-id', new AbortController().signal)).rejects.toThrow('Invalid');
    expect(rpc).not.toHaveBeenCalled();
    abortSignal.mockResolvedValue({ data: null, error: null });
    await expect(CaptionJobsService.get('00000000-0000-0000-0000-000000000001', new AbortController().signal)).resolves.toBeNull();
  });
});
