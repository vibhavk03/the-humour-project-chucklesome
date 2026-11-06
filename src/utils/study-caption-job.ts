import { JOB_STATUSES, type JobStatus, type TaskStatus } from "@/types/caption-job";
import { isJobId } from "@/utils/caption-jobs";

export type StudyCaptionRequest = {
  studyId: number;
  humorFlavorSlug?: string;
} & (
  | { studyImageSetId: number; imageId?: never }
  | { imageId: string; studyImageSetId?: never }
);

// Persist only the request and job reference, never credentials or caption content.
export type PendingStudyCaptionJob = {
  apiUrl: string;
  userId: string;
  idempotencyKey: string;
  jobId?: string;
  request: StudyCaptionRequest;
  imageIds: string[];
};

export type StudyCaptionJob = {
  jobId: string;
  status: JobStatus;
  imageIds: string[];
  captionIds: string[];
  progress: {
    total: number;
    completed: number;
    failed: number;
    completedSteps: number;
    totalSteps: number;
  };
  tasks: Array<{
    imageId: string;
    status: TaskStatus;
    completedSteps: number;
    totalSteps: number;
    captionIds: string[];
    error: string | null;
  }>;
};

export type GenerationStatus = "queued" | "generating" | "success" | "error";
type Auth = { access_token: string; user: { id: string } };
type JobOptions = {
  apiUrl: string;
  getAuth: () => Promise<Auth>;
  signal: AbortSignal;
  onAccepted: (pending: PendingStudyCaptionJob) => void;
  onProgress: (job: StudyCaptionJob) => void | Promise<void>;
  fetchImpl?: typeof fetch;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
};

const count = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const ids = (value: unknown): value is string[] => Array.isArray(value)
  && value.every((id) => typeof id === "string" && isJobId(id));

export function parsePendingStudyCaptionJob(value: unknown): PendingStudyCaptionJob | null {
  if (!value || typeof value !== "object") return null;
  const pending = value as PendingStudyCaptionJob;
  if (typeof pending.apiUrl !== "string" || !pending.apiUrl
    || typeof pending.userId !== "string" || !isJobId(pending.userId)
    || typeof pending.idempotencyKey !== "string" || !isJobId(pending.idempotencyKey)
    || (pending.jobId !== undefined && (typeof pending.jobId !== "string" || !isJobId(pending.jobId)))
    || !ids(pending.imageIds) || !pending.imageIds.length
    || !pending.request || !count(pending.request.studyId) || pending.request.studyId === 0) return null;
  const { imageId, studyImageSetId, humorFlavorSlug } = pending.request;
  const singleImage = typeof imageId === "string" && isJobId(imageId) && studyImageSetId === undefined;
  const imageSet = count(studyImageSetId) && studyImageSetId > 0 && imageId === undefined;
  if ((!singleImage && !imageSet)
    || (humorFlavorSlug !== undefined && (typeof humorFlavorSlug !== "string" || !humorFlavorSlug.trim()))) return null;
  return pending;
}

export function parseStudyCaptionJob(value: unknown, jobId: string): StudyCaptionJob {
  const job = value as StudyCaptionJob | null;
  if (!job || job.jobId !== jobId || !JOB_STATUSES.includes(job.status)
    || !ids(job.imageIds) || !ids(job.captionIds) || !job.progress
    || ![job.progress.total, job.progress.completed, job.progress.failed,
      job.progress.completedSteps, job.progress.totalSteps].every(count)
    || !Array.isArray(job.tasks) || !job.tasks.length
    || !job.tasks.every((task) => task && typeof task.imageId === "string" && isJobId(task.imageId)
      && ["queued", "running", "completed", "failed"].includes(task.status)
      && count(task.completedSteps) && count(task.totalSteps) && ids(task.captionIds)
      && (task.error === null || typeof task.error === "string"))) {
    throw new Error("The caption job status response was invalid. Resume to check it again.");
  }
  return job;
}

export function imageGenerationProgress(job: StudyCaptionJob, imageId: string): {
  status: GenerationStatus; message: string | null;
} {
  const tasks = job.tasks.filter((task) => task.imageId === imageId);
  if (!tasks.length) return { status: "error", message: "The caption job did not include this image." };
  const finished = tasks.every((task) => task.status === "completed" || task.status === "failed");
  const failed = tasks.filter((task) => task.status === "failed");
  if (finished) return failed.length
    ? { status: "error", message: failed.map((task) => task.error || "Caption generation failed.").join(" ") }
    : { status: "success", message: null };
  const completed = tasks.reduce((sum, task) => sum + task.completedSteps, 0);
  const total = tasks.reduce((sum, task) => sum + task.totalSteps, 0);
  return {
    status: tasks.some((task) => task.status !== "queued" || task.completedSteps > 0) ? "generating" : "queued",
    message: total ? `${completed} of ${total} steps completed` : null,
  };
}

export class CaptionJobRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

// Short authenticated requests, with waiting in the browser between polls.
// The caller keeps the pending reference until study mappings have loaded.
export async function runStudyCaptionJob(pending: PendingStudyCaptionJob, options: JobOptions) {
  const apiUrl = options.apiUrl.replace(/\/+$/, "");
  if (pending.apiUrl !== apiUrl) throw new Error("This caption job belongs to a different API environment.");
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 60 * 60 * 1000);
  const signal = AbortSignal.any([options.signal, timeout]);
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.wait ?? waitForPoll;
  let auth: Auth;
  async function authenticate() {
    signal.throwIfAborted();
    auth = await options.getAuth();
    signal.throwIfAborted();
    if (!auth.access_token || auth.user.id !== pending.userId) {
      throw new Error("Sign in with the account that started this caption job to resume it.");
    }
  }
  async function api(path: string, method: "GET" | "POST", refreshed = false): Promise<unknown> {
    signal.throwIfAborted();
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method, cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        ...(method === "POST" ? { "Content-Type": "application/json", "Idempotency-Key": pending.idempotencyKey } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(pending.request) } : {}),
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    signal.throwIfAborted();
    if (response.status === 401 && !refreshed) {
      await authenticate();
      return api(path, method, true);
    }
    if (!response.ok) {
      const message = [body?.message, body?.statusMessage, body?.error]
        .find((value) => typeof value === "string" && value);
      throw new CaptionJobRequestError(response.status, message || `Unable to ${method === "POST" ? "start" : "check"} captions (${response.status}).`);
    }
    if (method === "POST" && response.status !== 202) throw new Error("Expected the API to accept a caption job.");
    return body;
  }
  const retryable = (error: unknown) => error instanceof TypeError
    || (error instanceof DOMException && error.name === "TimeoutError")
    || (error instanceof CaptionJobRequestError && (error.status === 429 || error.status >= 500));

  try {
    await authenticate();
    let jobId = pending.jobId;
    if (!jobId) {
      for (let attempt = 0; ; attempt++) {
        try {
          const accepted = await api("/pipeline/generate-captions", "POST") as { jobId?: unknown } | null;
          if (typeof accepted?.jobId !== "string" || !isJobId(accepted.jobId)) {
            throw new Error("The caption job response was invalid. Resume to check it again.");
          }
          jobId = accepted.jobId;
          options.onAccepted({ ...pending, jobId });
          break;
        } catch (error) {
          signal.throwIfAborted();
          if (!retryable(error) || attempt >= 2) throw error;
          await wait(1000 * (attempt + 1), signal);
        }
      }
    }
    for (;;) {
      let job: StudyCaptionJob;
      try {
        // Build the URL locally; never send a JWT to a URL from a response or draft.
        job = parseStudyCaptionJob(await api(`/pipeline/caption-job/${encodeURIComponent(jobId)}`, "GET"), jobId);
      } catch (error) {
        signal.throwIfAborted();
        if (!retryable(error)) throw error;
        await wait(3000, signal);
        continue;
      }
      await options.onProgress(job);
      signal.throwIfAborted();
      if (["completed", "partially_completed", "failed"].includes(job.status)) return job;
      await wait(3000, signal);
    }
  } catch (error) {
    if (timeout.aborted && !options.signal.aborted) {
      throw new Error("Captions are still processing. Resume generation to keep checking this job.");
    }
    throw error;
  }
}
