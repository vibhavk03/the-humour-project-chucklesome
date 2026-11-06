import { isJobId } from '@/utils/caption-jobs';
import { supabase } from '@/utils/supabase/client';
import type { CaptionJobDetail, CaptionJobList, JobStatus } from '@/types/caption-job';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
function requestError(error: { code?: string; message: string }) {
  if (error.code === '42501') return new Error('Superadmin access is required to view caption jobs.');
  if (error.code === 'PGRST202' || error.code === '42883') {
    return new Error('Caption job observability is not installed in this environment. Apply the caption_job_observability migration.');
  }
  return new Error(`Unable to load caption jobs: ${error.message}`);
}
export const CaptionJobsService = {
  async list(options: { days: number; status: JobStatus | ''; search: string; offset: number }, signal: AbortSignal) {
    const { data, error } = await client().rpc('admin_list_caption_jobs', {
      p_since: new Date(Date.now() - options.days * 86400000).toISOString(),
      p_status: options.status || undefined, p_search: isJobId(options.search) ? options.search.toLowerCase() : options.search,
      p_offset: options.offset, p_limit: 25,
    }).abortSignal(signal);
    if (error) throw requestError(error);
    if (!data) throw new Error('The caption job response was empty.');
    return data as unknown as CaptionJobList;
  },
  async get(id: string, signal: AbortSignal) {
    if (!isJobId(id)) {
      throw new Error('Invalid caption job ID.');
    }
    const { data, error } = await client().rpc('admin_get_caption_job', { p_job_id: id }).abortSignal(signal);
    if (error) throw requestError(error);
    return data as unknown as CaptionJobDetail | null;
  },
};
