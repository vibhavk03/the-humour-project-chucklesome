export const IMAGE_REPLACEMENT_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const
export type ImageReplacementStatus = (typeof IMAGE_REPLACEMENT_STATUSES)[number]
export type ExternalImageReplacementJob = {
  id: string
  import_id: string
  user_id: string
  image_id: string
  source_url: string
  image_url: string | null
  status: ImageReplacementStatus
  attempts: number
  error: string | null
  replacement_result: 'replaced' | 'reused' | 'superseded' | 'image_deleted' | null
  created_at: string
  updated_at: string
  available_at: string
  lease_expires_at: string | null
  dispatched_at: string | null
  can_retry: boolean
}
export type ExternalImageReplacementJobs = {
  jobs: ExternalImageReplacementJob[]
  counts: Record<ImageReplacementStatus | 'total', number>
  filteredCount: number
  failedAlertCount: number
  checkedAt: string
}
export type ExternalImageReplacementAlerts = Pick<
  ExternalImageReplacementJobs,
  'failedAlertCount' | 'checkedAt'
>
