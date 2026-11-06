// Framework-free helpers for the study wizard, including cleanup of browser
// drafts saved by older versions. These can be tested without a DOM or Supabase.

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

// Collapse an arbitrary label (e.g. a flavor slug) into slug-safe pieces:
// lowercase, non-alphanumerics to hyphens, no leading/trailing/double hyphens.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// Use the admin's local date, retained caption count, and chosen humor flavor.
export function buildStudyName(
  date: Date,
  timeZone: string,
  captionCount: number,
  humorFlavorSlug: string
): string {
  const flavorSlug = normalizeSlug(humorFlavorSlug);
  if (!flavorSlug) return "";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!month || !day) return "";
    return `${month}-${day}--${captionCount}--${flavorSlug}`;
  } catch {
    return "";
  }
}

// Guarantee slug uniqueness against a set of taken slugs by appending -2, -3...
// Comparison is case-insensitive; the returned value preserves the base casing
// (which is already normalized upstream).
export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  const takenLower = new Set(Array.from(taken, (s) => s.toLowerCase()));
  if (!takenLower.has(base.toLowerCase())) return base;
  let n = 2;
  while (takenLower.has(`${base}-${n}`.toLowerCase())) n += 1;
  return `${base}-${n}`;
}

export function haveSameImageIds(
  left: Iterable<string>,
  right: Iterable<string>
): boolean {
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  if (leftIds.size !== rightIds.size) return false;
  for (const id of leftIds) {
    if (!rightIds.has(id)) return false;
  }
  return true;
}

export function combineImageSetMembers(
  setIds: readonly number[],
  membersBySet: ReadonlyMap<number, readonly string[]>
): string[] {
  return [...new Set(setIds.flatMap((id) => membersBySet.get(id) ?? []))];
}

// Keep individual exclusions for images already shown. Only newly introduced
// images are selected automatically, and removed sets cannot leave orphan images.
export function reconcileImageSetSelection(
  selected: ReadonlySet<string>,
  previousMembers: readonly string[],
  nextMembers: readonly string[]
): Set<string> {
  const previous = new Set(previousMembers);
  return new Set(nextMembers.filter((id) => selected.has(id) || !previous.has(id)));
}

export function buildGenerateCaptionsPayload(
  studyImageSetId: number,
  studyId: number,
  humorFlavorSlug: string
) {
  return { studyImageSetId, studyId, humorFlavorSlug };
}

// ---------------------------------------------------------------------------
// datetime-local <-> ISO helpers, timezone-aware. Mirrors studies/page.tsx so
// values round-trip through the admin's selected display timezone.
// ---------------------------------------------------------------------------

export function getDateTimeParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function toLocalInputValue(
  value: string | null | undefined,
  timeZone: string
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getDateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function toIsoOrNull(value: string, timeZone: string): string | null {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const guessParts = getDateTimeParts(utcGuess, timeZone);
  const guessDate = new Date(
    Date.UTC(
      Number(guessParts.year),
      Number(guessParts.month) - 1,
      Number(guessParts.day),
      Number(guessParts.hour),
      Number(guessParts.minute)
    )
  );
  const desiredDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const diffMs = desiredDate.getTime() - guessDate.getTime();
  return new Date(utcGuess.getTime() + diffMs).toISOString();
}

export function formatDateTimeDisplay(
  value: string | null | undefined,
  timeZone: string
): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

// Retire the old autosaved draft without reading or restoring any of its data.
export function clearLegacyWizardDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("study-wizard-draft-v1");
  } catch {
    // The wizard must still work when browser storage is unavailable.
  }
}
