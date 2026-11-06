import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Study } from "@/types/study";

const mocks = vi.hoisted(() => {
  const query = {
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    in: vi.fn(),
  };
  const client = { from: vi.fn(), auth: { getUser: vi.fn() } };
  return { query, client, configured: true };
});

vi.mock("@/utils/supabase/client", () => ({
  get supabase() {
    return mocks.configured ? mocks.client : null;
  },
}));

import { StudiesService, StudyCaptionMappingsService, StudyImageSetsService } from "./studies.service";

const profileId = "42129dcc-250b-45c1-af3e-bde1fb144111";
const study: Study = {
  id: 46,
  slug: "quick-34img-sep18",
  description: "Created with Quick Study (image + caption pairs).",
  start_datetime_utc: "2026-09-18T18:00:00.000Z",
  end_datetime_utc: "2026-09-19T18:00:00.000Z",
  is_private: true,
  is_hidden: true,
  created_datetime_utc: "2026-09-18T17:55:00.000Z",
  modified_datetime_utc: "2026-09-18T17:55:00.000Z",
  created_by_user_id: profileId,
  modified_by_user_id: profileId,
  created_by_client_id: null,
  modified_by_client_id: null,
};

const legacyStudy = ({ is_private, ...fields }: Study = study) => ({
  ...fields,
  is_hidden: is_private,
});

const missingPrivateColumn = {
  code: "PGRST204",
  message: "Could not find the 'is_private' column of 'studies' in the schema cache",
  details: null,
  hint: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured = true;
  mocks.client.from.mockReturnValue(mocks.query);
  mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: profileId } }, error: null });
  mocks.query.insert.mockReturnValue(mocks.query);
  mocks.query.update.mockReturnValue(mocks.query);
  mocks.query.eq.mockReturnValue(mocks.query);
  mocks.query.in.mockReturnValue(mocks.query);
  mocks.query.select.mockReturnValue(mocks.query);
  mocks.query.single.mockResolvedValue({ data: study, error: null });
  mocks.query.order.mockReturnValue(mocks.query);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("image set summaries", () => {
  it("uses database counts without downloading image details or truncating large set counts", async () => {
    mocks.query.order.mockResolvedValue({ data: [
      { id: 1, slug: "large-set", study_image_set_image_mappings: [{ count: 1205 }] },
      { id: 2, slug: "empty-set", study_image_set_image_mappings: [{ count: 0 }] },
    ], error: null });
    expect(await StudyImageSetsService.getAllImageSetsWithCounts()).toEqual([
      { id: 1, slug: "large-set", imageCount: 1205 },
      { id: 2, slug: "empty-set", imageCount: 0 },
    ]);
    expect(mocks.client.from.mock.calls).toEqual([["study_image_sets"]]);
    expect(mocks.query.select).toHaveBeenCalledWith("*, study_image_set_image_mappings(count)");
  });

  it("reports a failed count query instead of presenting every set as empty", async () => {
    mocks.query.order.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    await expect(StudyImageSetsService.getAllImageSetsWithCounts()).rejects.toThrow("Permission denied");
  });

  it.each([
    { code: "PGRST123", message: "Aggregate functions are not allowed" },
    { code: "42703", message: "column study_image_set_image_mappings.count does not exist" },
  ])("supports restricted counts with batched membership IDs and complete pagination ($code)", async (error) => {
    mocks.query.order
      .mockResolvedValueOnce({ data: null, error })
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null });
    const rows = [
      ...Array.from({ length: 1005 }, () => ({ study_image_set_id: 1 })),
      ...Array.from({ length: 5 }, () => ({ study_image_set_id: 2 })),
    ];
    mocks.query.range.mockImplementation(async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }));
    expect(await StudyImageSetsService.getAllImageSetsWithCounts()).toEqual([
      { id: 1, imageCount: 1005 }, { id: 2, imageCount: 5 }, { id: 3, imageCount: 0 },
    ]);
    expect(mocks.query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(mocks.query.select.mock.calls).toEqual([
      ["*, study_image_set_image_mappings(count)"], ["*"], ["study_image_set_id"], ["study_image_set_id"],
    ]);
    expect(mocks.query.in).toHaveBeenCalledWith("study_image_set_id", [1, 2, 3]);
  });
});

describe("release recovery reads", () => {
  it("restricts slug and ID recovery to the acting user and normalizes legacy visibility", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: legacyStudy(), error: null });
    expect(await StudiesService.findStudyForRelease({ slug: study.slug! }, profileId)).toMatchObject({ id: study.id, is_private: true });
    expect(mocks.query.eq).toHaveBeenCalledWith("created_by_user_id", profileId);
    expect(mocks.query.eq).toHaveBeenCalledWith("slug", study.slug);
    await StudiesService.findStudyForRelease({ id: study.id }, profileId);
    expect(mocks.query.eq).toHaveBeenCalledWith("id", study.id);
  });

  it("distinguishes missing drafts from failed recovery reads", async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await StudiesService.findStudyForRelease({ id: study.id }, profileId)).toBeNull();
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "Offline" } });
    await expect(StudiesService.findStudyForRelease({ id: study.id }, profileId)).rejects.toThrow("Offline");
  });

  it("reads every mapping page so retries cannot duplicate links beyond the API row limit", async () => {
    const mappings = Array.from({ length: 1001 }, (_, id) => ({ id, caption_id: `caption-${id}` }));
    mocks.query.range.mockImplementation(async (from: number, to: number) => ({ data: mappings.slice(from, to + 1), error: null }));
    expect(await StudyCaptionMappingsService.getReleaseMappings(study.id)).toEqual(mappings);
    expect(mocks.query.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("does not return an empty selection when a mapping read fails", async () => {
    mocks.query.range.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    await expect(StudyCaptionMappingsService.getReleaseMappings(study.id)).rejects.toThrow("Permission denied");
  });
});

describe("study creation", () => {
  it("defaults to private when visibility is omitted", async () => {
    await StudiesService.createStudyWithResult({ slug: "draft" });
    expect(mocks.query.insert).toHaveBeenCalledWith([expect.objectContaining({ is_private: true })]);
  });
  it("creates a private study using the current schema and logged-in user's audit fields", async () => {
    const payload = {
      slug: study.slug!,
      description: study.description,
      start_datetime_utc: study.start_datetime_utc,
      end_datetime_utc: study.end_datetime_utc,
      is_private: true,
    };

    expect(await StudiesService.createStudyWithResult(payload)).toEqual({ data: study, error: null });
    expect(mocks.client.from).toHaveBeenCalledWith("studies");
    expect(mocks.query.insert).toHaveBeenCalledWith([
      { ...payload, created_by_user_id: profileId, modified_by_user_id: profileId },
    ]);
  });

  it.each([
    {
      code: "PGRST204",
      message: "Could not find the 'is_hidden' column of 'studies' in the schema cache",
      details: null,
      hint: null,
    },
    {
      code: "23505",
      message: 'duplicate key value violates unique constraint "studies_slug_key"',
      details: "Key (slug)=(quick-34img-sep18) already exists.",
      hint: "Choose another study name.",
    },
    {
      code: "42501",
      message: "new row violates row-level security policy for table studies",
      details: null,
      hint: null,
    },
  ])("preserves the database error for $code instead of just returning null", async (error) => {
    mocks.query.single.mockResolvedValue({ data: null, error });

    expect(await StudiesService.createStudyWithResult({ slug: study.slug! })).toEqual({
      data: null,
      error: [error.message, error.details, error.hint].filter(Boolean).join(" "),
      code: error.code,
    });
    expect(mocks.query.insert).toHaveBeenCalledTimes(1);
  });

  it("reports an expired login before attempting to insert", async () => {
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "JWT expired" } });

    expect(await StudiesService.createStudyWithResult({ slug: study.slug! })).toEqual({
      data: null,
      error: "JWT expired",
    });
    expect(mocks.query.insert).not.toHaveBeenCalled();
  });

  it("reports a missing client", async () => {
    mocks.configured = false;

    expect(await StudiesService.createStudyWithResult({ slug: study.slug! })).toEqual({
      data: null,
      error: "Supabase client is not configured.",
    });
  });

  it("returns an actionable failure for a rejected request and allows retry", async () => {
    mocks.query.single.mockRejectedValueOnce(new Error("Failed to fetch"));

    expect(await StudiesService.createStudyWithResult({ slug: study.slug! })).toEqual({
      data: null,
      error: "Failed to fetch",
    });
    expect(mocks.query.insert).toHaveBeenCalledTimes(1);
    expect(await StudiesService.createStudyWithResult({ slug: study.slug! })).toEqual({ data: study, error: null });
  });

  it("does not report success without a returned study", async () => {
    mocks.query.single.mockResolvedValue({ data: null, error: null });

    expect(await StudiesService.createStudyWithResult({ slug: study.slug! })).toEqual({
      data: null,
      error: "The database did not return the created study.",
    });
  });

  it("preserves the existing createStudy return contract for the other builders", async () => {
    expect(await StudiesService.createStudy({ slug: study.slug! })).toEqual(study);
    mocks.query.single.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    expect(await StudiesService.createStudy({ slug: study.slug! })).toBeNull();
  });
});

describe("legacy production study schema", () => {
  it.each([true, false])("creates a study with legacy visibility %s after a missing-column response", async (isPrivate) => {
    const legacy = legacyStudy({ ...study, is_private: isPrivate });
    mocks.query.single
      .mockResolvedValueOnce({ data: null, error: missingPrivateColumn })
      .mockResolvedValueOnce({ data: legacy, error: null });

    const result = await StudiesService.createStudyWithResult({ slug: study.slug!, is_private: isPrivate });

    expect(result).toEqual({ data: { ...legacy, is_private: isPrivate }, error: null });
    expect(mocks.query.insert).toHaveBeenCalledTimes(2);
    const firstRow = mocks.query.insert.mock.calls[0][0][0];
    const retryRow = mocks.query.insert.mock.calls[1][0][0];
    expect(firstRow).toHaveProperty("is_private", isPrivate);
    expect(retryRow).not.toHaveProperty("is_private");
    expect(retryRow).toMatchObject({
      slug: study.slug,
      is_hidden: isPrivate,
      created_by_user_id: profileId,
      modified_by_user_id: profileId,
    });
  });

  it.each([true, false])("updates legacy visibility to %s without losing other changes", async (isPrivate) => {
    const legacy = legacyStudy({ ...study, is_private: isPrivate });
    mocks.query.single
      .mockResolvedValueOnce({ data: null, error: missingPrivateColumn })
      .mockResolvedValueOnce({ data: legacy, error: null });

    const result = await StudiesService.updateStudy(study.id, { is_private: isPrivate, description: "Updated" });

    expect(result?.is_private).toBe(isPrivate);
    expect(mocks.query.update).toHaveBeenCalledTimes(2);
    expect(mocks.query.update).toHaveBeenLastCalledWith({
      is_hidden: isPrivate,
      description: "Updated",
      modified_by_user_id: profileId,
    });
    expect(mocks.query.eq).toHaveBeenNthCalledWith(1, "id", study.id);
    expect(mocks.query.eq).toHaveBeenNthCalledWith(2, "id", study.id);
  });

  it("preserves a failed fallback response without retrying again", async () => {
    mocks.query.single
      .mockResolvedValueOnce({ data: null, error: missingPrivateColumn })
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Permission denied" } });

    expect(await StudiesService.createStudyWithResult({ slug: study.slug! })).toEqual({
      data: null,
      error: "Permission denied",
      code: "42501",
    });
    expect(mocks.query.insert).toHaveBeenCalledTimes(2);
  });

  it("normalizes legacy study lists so hidden studies cannot become the shown study", async () => {
    const visible = legacyStudy({ ...study, id: study.id - 1, is_private: false });
    mocks.query.order.mockResolvedValue({ data: [legacyStudy(), visible], error: null });

    const studies = await StudiesService.getAllStudies();

    expect(studies.map((row) => row.is_private)).toEqual([true, false]);
    expect(StudiesService.getCurrentlyShownStudy(studies, new Date("2026-09-18T18:30:00Z"))?.id).toBe(visible.id);
  });

  it.each([true, false])("normalizes legacy visibility %s when reading a study by id", async (isPrivate) => {
    mocks.query.single.mockResolvedValue({ data: legacyStudy({ ...study, is_private: isPrivate }), error: null });

    expect((await StudiesService.getStudyById(study.id))?.is_private).toBe(isPrivate);
  });
});

describe("study visibility", () => {
  function mockPublication({ mappingError = false, imageError = false, captionError = false, missingImages = false, empty = false } = {}) {
    const mappingsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: empty ? [] : [
          { caption_id: "kept-1", captions: { image_id: "shared-image" } },
          { caption_id: "kept-2", captions: { image_id: "shared-image" } },
        ],
        error: mappingError ? { message: "Permission denied" } : null,
      }),
    };
    const visibilityQuery = (table: string) => ({
      update: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: table === "images" ? (missingImages ? [] : [{ id: "shared-image" }]) : [{ id: "kept-1" }, { id: "kept-2" }],
        error: (table === "images" ? imageError : captionError) ? { message: "Permission denied" } : null,
      }),
    });
    const images = visibilityQuery("images");
    const captions = visibilityQuery("captions");
    mocks.client.from.mockImplementation((table) => {
      if (table === "study_caption_mappings") return mappingsQuery;
      if (table === "images") return images;
      if (table === "captions") return captions;
      return mocks.query;
    });
    mocks.query.single.mockResolvedValue({ data: { ...study, is_private: false }, error: null });
    return { mappingsQuery, images, captions };
  }

  it("publishes only saved captions and their images before releasing the study", async () => {
    const { mappingsQuery, images, captions } = mockPublication();
    const result = await StudiesService.publishStudy(study.id, { slug: "2-captions-dry-humor" });
    expect(result?.is_private).toBe(false);
    expect(mappingsQuery.eq).toHaveBeenCalledWith("study_id", study.id);
    expect(images.in).toHaveBeenCalledWith("id", ["shared-image"]);
    expect(captions.in).toHaveBeenCalledWith("id", ["kept-1", "kept-2"]);
    expect(captions.update).toHaveBeenCalledWith({ is_public: true, modified_by_user_id: profileId });
    expect(mocks.query.update).toHaveBeenCalledWith({ slug: "2-captions-dry-humor", is_private: false, modified_by_user_id: profileId });
    expect(mocks.query.update.mock.invocationCallOrder[0]).toBeGreaterThan(captions.update.mock.invocationCallOrder[0]);
  });

  it.each([{ mappingError: true }, { imageError: true }, { captionError: true }, { missingImages: true }, { empty: true }])(
    "keeps the study private when publishing contents fails: %j", async (failure) => {
      mockPublication(failure);
      expect(await StudiesService.publishStudy(study.id, {})).toBeNull();
      expect(mocks.query.update).not.toHaveBeenCalled();
    }
  );

  it("reads every mapping page and publishes large studies in bounded batches", async () => {
    const { mappingsQuery, captions } = mockPublication();
    const mappings = Array.from({ length: 501 }, (_, index) => ({ caption_id: `caption-${index}`, captions: { image_id: "shared-image" } }));
    mappingsQuery.range
      .mockResolvedValueOnce({ data: mappings.slice(0, 500), error: null })
      .mockResolvedValueOnce({ data: mappings.slice(500), error: null });
    captions.select
      .mockResolvedValueOnce({ data: Array.from({ length: 200 }, () => ({ id: "caption" })), error: null })
      .mockResolvedValueOnce({ data: Array.from({ length: 200 }, () => ({ id: "caption" })), error: null })
      .mockResolvedValueOnce({ data: Array.from({ length: 101 }, () => ({ id: "caption" })), error: null });
    expect((await StudiesService.publishStudy(study.id, {}))?.is_private).toBe(false);
    expect(mappingsQuery.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(captions.in.mock.calls.flatMap((call) => call[1])).toEqual(mappings.map((mapping) => mapping.caption_id));
  });

  it("releases a study using is_private and the logged-in user's audit id", async () => {
    mocks.query.single.mockResolvedValue({ data: { ...study, is_private: false }, error: null });

    expect(await StudiesService.updateStudy(study.id, { is_private: false })).toEqual({
      ...study,
      is_private: false,
    });
    expect(mocks.query.update).toHaveBeenCalledWith({ is_private: false, modified_by_user_id: profileId });
    expect(mocks.query.eq).toHaveBeenCalledWith("id", study.id);
  });

  it("never treats a private study as currently shown", () => {
    const at = new Date("2026-09-18T18:30:00.000Z");
    const publicStudy = { ...study, id: study.id - 1, is_private: false };

    expect(StudiesService.isStudyActiveAt(study, at)).toBe(false);
    expect(StudiesService.getCurrentlyShownStudy([study, publicStudy], at)).toEqual(publicStudy);
  });
});
