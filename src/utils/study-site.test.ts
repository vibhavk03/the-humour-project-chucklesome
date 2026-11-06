import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getStudySiteUrl", () => {
  it("builds a production URL with the numeric study id", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "production");
    const { getStudySiteUrl, STUDY_SITE_HOST } = await import("./study-site");

    expect(STUDY_SITE_HOST).toBe("humorstudy.org");
    expect(getStudySiteUrl(42)).toBe("https://humorstudy.org/study/42");
  });

  it("builds a staging URL with the numeric study id", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "staging");
    const { getStudySiteUrl, STUDY_SITE_HOST } = await import("./study-site");

    expect(STUDY_SITE_HOST).toBe("slightlyhumorous.org");
    expect(getStudySiteUrl(42)).toBe("https://slightlyhumorous.org/study/42");
  });
});
