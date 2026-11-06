export const JOB_STATUSES = ['queued', 'running', 'completed', 'partially_completed', 'failed'] as const;
export type JobStatus = typeof JOB_STATUSES[number];
export type TaskStatus = Exclude<JobStatus, 'partially_completed'>;
export type JobCounts = Record<JobStatus | 'total', number>;
export interface CaptionJobSummary {
  id: string;
  user_id: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  status: JobStatus;
  task_count: number;
  completed_tasks: number;
  failed_tasks: number;
  completed_steps: number;
  total_steps: number;
  caption_count: number;
  expired_leases: number;
  retrying_tasks: number;
}
export interface CaptionJobList {
  jobs: CaptionJobSummary[];
  filtered_count: number;
  counts: JobCounts;
}
export interface CaptionJobStep {
  number: number;
  step_id: number | null;
  type: string | null;
  model: string | null;
  provider: string | null;
}
export interface CaptionJobTask {
  id: string;
  image_id: string;
  humor_flavor_id: number;
  humor_flavor_slug: string | null;
  caption_request_id: number;
  llm_prompt_chain_id: number;
  status: TaskStatus;
  attempts: number;
  completed_steps: number;
  total_steps: number;
  caption_ids: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
  available_at: string;
  dispatched_at: string | null;
  lease_expires_at: string | null;
  steps: CaptionJobStep[];
}
export interface CaptionJobDetail {
  id: string;
  user_id: string | null;
  client_id: string | null;
  created_at: string;
  study_id: number | null;
  study_image_set_id: number | null;
  tasks: CaptionJobTask[];
}
