import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, select, inFilter, abortSignal } = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), inFilter: vi.fn(), abortSignal: vi.fn(),
}));
vi.mock("@/utils/supabase/client", () => ({ supabase: { from } }));
import { loadCaptionJobResults } from "./caption-job-results.service";

beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue({ select });
  select.mockReturnValue({ in: inFilter });
  inFilter.mockReturnValue({ abortSignal });
});

describe("caption job results", () => {
  it("loads only the job's saved IDs in job order without duplicate rows", async () => {
    abortSignal.mockResolvedValue({ data: [{ id: "b", content: "Second" }, { id: "a", content: "First" }], error: null });
    const captions = await loadCaptionJobResults(["a", "b", "a"], new AbortController().signal);
    expect(from).toHaveBeenCalledWith("captions");
    expect(inFilter).toHaveBeenCalledWith("id", ["a", "b"]);
    expect(captions.map((caption) => caption.content)).toEqual(["First", "Second"]);
  });

  it("loads large jobs in bounded batches without hitting the default row limit", async () => {
    const ids = Array.from({ length: 1001 }, (_, index) => `caption-${index}`);
    inFilter.mockImplementation((_column, batch: string[]) => ({
      abortSignal: async () => ({ data: batch.map((id) => ({ id, content: id })), error: null }),
    }));
    const captions = await loadCaptionJobResults(ids, new AbortController().signal);
    expect(captions.map((caption) => caption.id)).toEqual(ids);
    expect(inFilter).toHaveBeenCalledTimes(11);
    expect(inFilter.mock.calls.every(([, batch]) => batch.length <= 100)).toBe(true);
  });

  it("does not treat missing or inaccessible saved captions as complete results", async () => {
    abortSignal.mockResolvedValue({ data: [{ id: "a" }], error: null });
    await expect(loadCaptionJobResults(["a", "b"], new AbortController().signal)).rejects.toThrow("Some saved captions could not be loaded");
  });

  it("reports database failures so the existing job can be resumed", async () => {
    abortSignal.mockResolvedValue({ data: null, error: { message: "Connection failed" } });
    await expect(loadCaptionJobResults(["a"], new AbortController().signal)).rejects.toThrow("Resume generation");
  });

  it("cancels reads on navigation and skips work for jobs without captions", async () => {
    const controller = new AbortController();
    await expect(loadCaptionJobResults([], controller.signal)).resolves.toEqual([]);
    controller.abort();
    await expect(loadCaptionJobResults(["a"], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(from).not.toHaveBeenCalled();
  });
});
