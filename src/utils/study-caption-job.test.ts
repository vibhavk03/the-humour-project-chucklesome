import { describe, expect, it, vi } from "vitest";
import {
  imageGenerationProgress,
  parsePendingStudyCaptionJob,
  runStudyCaptionJob,
  type PendingStudyCaptionJob,
  type StudyCaptionJob,
} from "./study-caption-job";

const imageId = "00000000-0000-4000-8000-000000000001";
const otherImageId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const captionId = "00000000-0000-4000-8000-000000000004";
const userId = "00000000-0000-4000-8000-000000000005";
const pending: PendingStudyCaptionJob = {
  apiUrl: "https://api.example.test",
  userId,
  idempotencyKey: "00000000-0000-4000-8000-000000000006",
  request: { studyId: 22, studyImageSetId: 11, humorFlavorSlug: "dry-campus-roasts" },
  imageIds: [imageId, otherImageId],
};

function job(status: StudyCaptionJob["status"] = "completed"): StudyCaptionJob {
  const completed = status === "completed" || status === "partially_completed";
  const failed = status === "failed" || status === "partially_completed";
  return {
    jobId, status, imageIds: pending.imageIds,
    captionIds: completed ? [captionId] : [],
    progress: { total: 2, completed: completed ? (failed ? 1 : 2) : 0,
      failed: failed ? (completed ? 1 : 2) : 0, completedSteps: completed ? 4 : 1, totalSteps: 4 },
    tasks: pending.imageIds.map((id, index) => ({
      imageId: id,
      status: failed && (!completed || index === 1) ? "failed"
        : completed ? "completed" : status === "running" ? "running" : "queued",
      completedSteps: completed ? 2 : 0, totalSteps: 2,
      captionIds: completed && index === 0 ? [captionId] : [],
      error: failed ? "Provider rejected the request" : null,
    })),
  };
}

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function setup(responses: Array<Response | Error>) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected request");
    if (next instanceof Error) throw next;
    return next;
  });
  const controller = new AbortController();
  return {
    apiUrl: pending.apiUrl,
    fetchImpl,
    controller,
    signal: controller.signal,
    getAuth: vi.fn().mockResolvedValue({ access_token: "user-jwt", user: { id: userId } }),
    onAccepted: vi.fn(),
    onProgress: vi.fn(),
    wait: vi.fn().mockResolvedValue(undefined),
  };
}

describe("study caption job client", () => {
  it.each([
    { studyId: 22, imageId },
    { studyId: 22, imageId, humorFlavorSlug: "dry-campus-roasts" },
    { studyId: 22, studyImageSetId: 11 },
  ])("submits single-image and current-mix requests unchanged: %j", async (request) => {
    const input = { ...pending, request };
    expect(parsePendingStudyCaptionJob(input)).toEqual(input);
    const options = setup([response({ jobId }, 202), response(job())]);
    await runStudyCaptionJob(input, options);
    expect(JSON.parse(String(options.fetchImpl.mock.calls[0][1]?.body))).toEqual(request);
  });

  it("reports a partial failure within one image's humor mix while retaining its saved captions", () => {
    const update = job("partially_completed");
    update.tasks[1].imageId = imageId;
    update.imageIds = [imageId];
    expect(imageGenerationProgress(update, imageId)).toEqual({ status: "error", message: "Provider rejected the request" });
    expect(update.captionIds).toEqual([captionId]);
  });

  it("submits the image set once, then polls real progress through completion", async () => {
    const options = setup([
      response({ jobId, statusUrl: "https://untrusted.test/steal-token" }, 202),
      response(job("queued")), response(job("running")), response(job()),
    ]);
    expect((await runStudyCaptionJob(pending, options)).status).toBe("completed");
    expect(options.fetchImpl).toHaveBeenNthCalledWith(1, `${pending.apiUrl}/pipeline/generate-captions`, expect.objectContaining({
      method: "POST", body: JSON.stringify(pending.request),
      headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json", "Idempotency-Key": pending.idempotencyKey },
    }));
    for (const [url, init] of options.fetchImpl.mock.calls.slice(1)) {
      expect(url).toBe(`${pending.apiUrl}/pipeline/caption-job/${jobId}`);
      expect(init).toMatchObject({ method: "GET", cache: "no-store", headers: { Authorization: "Bearer user-jwt" } });
    }
    expect(options.onAccepted).toHaveBeenCalledWith({ ...pending, jobId });
    expect(options.onProgress.mock.calls.map(([update]) => update.status)).toEqual(["queued", "running", "completed"]);
    expect(options.wait.mock.calls.map(([ms]) => ms)).toEqual([3000, 3000]);
  });

  it("retries uncertain submissions with the same body and idempotency key", async () => {
    const options = setup([new TypeError("Network failure"), response({}, 503), response({ jobId }, 202), response(job())]);
    await runStudyCaptionJob(pending, options);
    const submissions = options.fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(submissions).toHaveLength(3);
    for (const [, init] of submissions) {
      expect(init?.body).toBe(JSON.stringify(pending.request));
      expect(init?.headers).toHaveProperty("Idempotency-Key", pending.idempotencyKey);
    }
  });

  it("resumes an accepted job without submitting again", async () => {
    const options = setup([response(job())]);
    await runStudyCaptionJob({ ...pending, jobId }, options);
    expect(options.fetchImpl).toHaveBeenCalledTimes(1);
    expect(options.fetchImpl.mock.calls[0][1]?.method).toBe("GET");
    expect(options.onAccepted).not.toHaveBeenCalled();
  });

  it("retries transient polling failures against the same job", async () => {
    const options = setup([response({}, 429), new TypeError("Offline"), response(job())]);
    await runStudyCaptionJob({ ...pending, jobId }, options);
    expect(options.fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(options.wait).toHaveBeenCalledTimes(2);
  });

  it("refreshes authentication and continues polling the existing job", async () => {
    const options = setup([response({}, 401), response(job())]);
    options.getAuth.mockResolvedValueOnce({ access_token: "expired-jwt", user: { id: userId } });
    await runStudyCaptionJob({ ...pending, jobId }, options);
    expect(options.getAuth).toHaveBeenCalledTimes(2);
    expect(options.fetchImpl.mock.calls[0][1]?.headers).toHaveProperty("Authorization", "Bearer expired-jwt");
    expect(options.fetchImpl.mock.calls[1][1]?.headers).toHaveProperty("Authorization", "Bearer user-jwt");
  });

  it("does not use a different user's token after a refresh", async () => {
    const options = setup([response({}, 401)]);
    options.getAuth.mockResolvedValueOnce({ access_token: "user-jwt", user: { id: userId } })
      .mockResolvedValueOnce({ access_token: "other-jwt", user: { id: otherImageId } });
    await expect(runStudyCaptionJob({ ...pending, jobId }, options)).rejects.toThrow("account that started");
    expect(options.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never sends credentials to a different environment restored from a draft", async () => {
    const options = setup([]);
    await expect(runStudyCaptionJob({ ...pending, apiUrl: "https://other.test" }, options)).rejects.toThrow("different API environment");
    expect(options.getAuth).not.toHaveBeenCalled();
    expect(options.fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["partially_completed", "failed"] as const)("returns HTTP 200 terminal %s with per-image outcomes", async (status) => {
    const options = setup([response(job(status))]);
    const result = await runStudyCaptionJob({ ...pending, jobId }, options);
    expect(result.status).toBe(status);
    expect(imageGenerationProgress(result, otherImageId)).toEqual({ status: "error", message: "Provider rejected the request" });
    if (status === "partially_completed") {
      expect(result.captionIds).toEqual([captionId]);
      expect(imageGenerationProgress(result, imageId).status).toBe("success");
    }
  });

  it("stops polling when unmounted without cancelling the backend job", async () => {
    const options = setup([response(job("running"))]);
    options.wait.mockImplementation(async () => options.controller.abort());
    await expect(runStudyCaptionJob({ ...pending, jobId }, options)).rejects.toMatchObject({ name: "AbortError" });
    expect(options.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps a newly accepted job resumable when interrupted", async () => {
    const options = setup([response({ jobId }, 202)]);
    options.onAccepted.mockImplementation(() => options.controller.abort());
    await expect(runStudyCaptionJob(pending, options)).rejects.toMatchObject({ name: "AbortError" });
    expect(options.onAccepted).toHaveBeenCalledWith({ ...pending, jobId });
    expect(options.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports rejected submissions without retrying validation errors", async () => {
    const options = setup([response({ message: "Too many images" }, 400)]);
    await expect(runStudyCaptionJob(pending, options)).rejects.toThrow("Too many images");
    expect(options.fetchImpl).toHaveBeenCalledTimes(1);
    expect(options.onAccepted).not.toHaveBeenCalled();
  });

  it("rejects malformed status instead of marking images successful", async () => {
    const options = setup([response({ ...job(), tasks: [] })]);
    await expect(runStudyCaptionJob({ ...pending, jobId }, options)).rejects.toThrow("status response was invalid");
    expect(options.onProgress).not.toHaveBeenCalled();
  });

  it("lets a result-loading failure resume the same completed job", async () => {
    const options = setup([response(job()), response(job())]);
    options.onProgress.mockRejectedValueOnce(new Error("Cannot load saved captions"));
    await expect(runStudyCaptionJob({ ...pending, jobId }, options)).rejects.toThrow("Cannot load saved captions");
    await runStudyCaptionJob({ ...pending, jobId }, options);
    expect(options.fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
});

describe("pending job persistence", () => {
  it("round-trips the exact request for a subset or single-image retry", () => {
    expect(parsePendingStudyCaptionJob(JSON.parse(JSON.stringify(pending)))).toEqual(pending);
    expect(parsePendingStudyCaptionJob({ ...pending, jobId })).toEqual({ ...pending, jobId });
  });
  it.each([null, {}, { ...pending, request: {} }, { ...pending, jobId: "invalid" }, { ...pending, imageIds: [1] }])(
    "ignores corrupt draft job references", (value) => expect(parsePendingStudyCaptionJob(value)).toBeNull()
  );
  it.each([
    { studyId: 22 },
    { studyId: 22, imageId, studyImageSetId: 11 },
    { studyId: 22, imageId: "invalid" },
    { studyId: 22, imageId, humorFlavorSlug: "" },
  ])("rejects ambiguous or invalid persisted request inputs: %j", (request) => {
    expect(parsePendingStudyCaptionJob({ ...pending, request })).toBeNull();
  });
});
