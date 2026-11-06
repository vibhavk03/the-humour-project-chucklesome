import { afterEach, describe, it, expect, vi } from "vitest";
import {
  buildGenerateCaptionsPayload,
  buildStudyName,
  clearLegacyWizardDraft,
  combineImageSetMembers,
  ensureUniqueSlug,
  haveSameImageIds,
  normalizeSlug,
  reconcileImageSetSelection,
  slugify,
  toIsoOrNull,
  toLocalInputValue,
} from "./study-wizard-utils";

describe("normalizeSlug", () => {
  it("lowercases, trims and hyphenates whitespace", () => {
    expect(normalizeSlug("  Fall 2024 Batch ")).toBe("fall-2024-batch");
    expect(normalizeSlug("07-20--30--dry-campus-roasts")).toBe("07-20--30--dry-campus-roasts");
  });
});

describe("slugify", () => {
  it("collapses non-alphanumerics and trims stray hyphens", () => {
    expect(slugify("Lydia's Test!! (v2)")).toBe("lydia-s-test-v2");
    expect(slugify("--already--slug--")).toBe("already-slug");
  });
});

describe("buildStudyName", () => {
  it("uses MM-DD, the caption count, and the flavor slug with double-hyphen separators", () => {
    expect(buildStudyName(new Date("2026-07-20T12:00:00Z"), "UTC", 30, "dry-campus-roasts")).toBe(
      "07-20--30--dry-campus-roasts"
    );
    expect(buildStudyName(new Date("2026-01-03T12:00:00Z"), "UTC", 0, "1563-lydia-9-6-26-reaction-jokes")).toBe(
      "01-03--0--1563-lydia-9-6-26-reaction-jokes"
    );
  });

  it("waits for a humor flavor before suggesting a name", () => {
    expect(buildStudyName(new Date("2026-07-20T12:00:00Z"), "UTC", 0, "")).toBe("");
  });

  it("resolves the date token in the given timezone", () => {
    // 02:00Z on Jul 20 is still Jul 19 in New York.
    const date = new Date("2026-07-20T02:00:00Z");
    expect(buildStudyName(date, "America/New_York", 12, "dry-campus-roasts")).toBe(
      "07-19--12--dry-campus-roasts"
    );
  });
});

describe("ensureUniqueSlug", () => {
  it("returns the base when it is free", () => {
    expect(ensureUniqueSlug("study-a", new Set(["other"]))).toBe("study-a");
  });

  it("appends the next free numeric suffix (case-insensitive)", () => {
    const taken = new Set(["study-a", "study-a-2", "STUDY-A-3"]);
    expect(ensureUniqueSlug("study-a", taken)).toBe("study-a-4");
  });
});

describe("caption generation contract", () => {
  it("builds the image-set batch payload expected by the pipeline", () => {
    expect(buildGenerateCaptionsPayload(11, 22, "dry-campus-roasts")).toEqual({
      studyImageSetId: 11,
      studyId: 22,
      humorFlavorSlug: "dry-campus-roasts",
    });
  });

  it("compares image sets without depending on order or duplicates", () => {
    expect(haveSameImageIds(["a", "b", "a"], ["b", "a"])).toBe(true);
    expect(haveSameImageIds(["a", "b"], ["a", "c"])).toBe(false);
  });
});

describe("multiple image sets", () => {
  const members = new Map([[11, ["a", "b", "a"]], [22, ["b", "c"]]]);

  it("combines overlapping sets once in selection order", () => {
    expect(combineImageSetMembers([11, 22], members)).toEqual(["a", "b", "c"]);
    expect(combineImageSetMembers([22, 11], members)).toEqual(["b", "c", "a"]);
  });

  it("selects new images while preserving individual exclusions in shared images", () => {
    expect([...reconcileImageSetSelection(new Set(["a"]), ["a", "b"], ["a", "b", "c"])]).toEqual(["a", "c"]);
  });

  it("removes only images unique to a removed set", () => {
    expect([...reconcileImageSetSelection(new Set(["a", "b", "c"]), ["a", "b", "c"], ["b", "c"])]).toEqual(["b", "c"]);
  });

  it("keeps shared exclusions when a set is removed and clears the final set", () => {
    expect([...reconcileImageSetSelection(new Set(["a", "c"]), ["a", "b", "c"], ["b", "c"])]).toEqual(["c"]);
    expect([...reconcileImageSetSelection(new Set(["c"]), ["b", "c"], [])]).toEqual([]);
  });

  it("does not retain unrelated library images when choosing existing sets", () => {
    expect([...reconcileImageSetSelection(new Set(["other"]), [], ["a", "b"])]).toEqual(["a", "b"]);
  });
});

describe("timezone round-trip", () => {
  it("toLocalInputValue then toIsoOrNull preserves the instant in UTC", () => {
    const iso = "2026-07-20T15:30:00.000Z";
    const local = toLocalInputValue(iso, "UTC");
    expect(local).toBe("2026-07-20T15:30");
    expect(toIsoOrNull(local, "UTC")).toBe(iso);
  });

  it("round-trips through a non-UTC zone back to the same instant", () => {
    const iso = "2026-07-20T15:30:00.000Z";
    const local = toLocalInputValue(iso, "America/New_York");
    expect(toIsoOrNull(local, "America/New_York")).toBe(iso);
  });

  it("returns null for malformed input", () => {
    expect(toIsoOrNull("", "UTC")).toBeNull();
    expect(toIsoOrNull("not-a-date", "UTC")).toBeNull();
  });
});

describe("legacy draft cleanup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes old wizard drafts without touching other browser settings", () => {
    const storage = new Map([
      ["study-wizard-draft-v1", "old draft"],
      ["theme", "dark"],
    ]);
    vi.stubGlobal("window", { localStorage: { removeItem: (key: string) => storage.delete(key) } });

    clearLegacyWizardDraft();
    clearLegacyWizardDraft();

    expect([...storage]).toEqual([["theme", "dark"]]);
  });

  it("works without browser globals", () => {
    vi.stubGlobal("window", undefined);
    expect(() => clearLegacyWizardDraft()).not.toThrow();
  });

  it("does not prevent the wizard from loading when storage access is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("Storage blocked");
      },
    });
    expect(() => clearLegacyWizardDraft()).not.toThrow();
  });
});
