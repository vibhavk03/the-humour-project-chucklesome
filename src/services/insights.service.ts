import { Captions } from "@/types/captions";
import { CaptionService } from "./captions.service";

const SWEET_MIN = 40;
const SWEET_MAX = 80;
const WHEN_RE = /^[\s"'“”‘’(\[]*when\b/i;

export type InsightsRange = {
  startISO: string | Date;   
  endISO: string | Date;    
  searchQuery?: string;
  searchType?: "all" | "content" | "id" | "imageId" | "profileId";
};

export type SeriesPoint = { date: string; count: number };
export type Stats = {
  total: number;
  distinctUsers: number;
  medianLen: number;
  sweetPct: number;
  startsWithWhenPct: number;
  topStartTriCoverage: number;
  clusterCount: number;
  largestCluster: number;
};

function toIsoString(v?: string | Date | null): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  try {
    return v.toISOString();
  } catch {
    return undefined;
  }
}

function normText(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(nums: number[]) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

function clusterNearDuplicates(
  contents: string[],
  opts?: { threshold?: number; shingle?: number; maxComparisonsPerItem?: number }
) {
  const threshold = opts?.threshold ?? 0.85;    // try 0.85
  const shingle   = opts?.shingle ?? 3;         // word 3-grams
  const maxCmp    = opts?.maxComparisonsPerItem ?? 50;

  const toTokens = (s: string) => normText(s).split(" ").filter(Boolean);
  const shingles = (tokens: string[]) => {
    const out: string[] = [];
    for (let i = 0; i <= tokens.length - shingle; i++) {
      out.push(tokens.slice(i, i + shingle).join(" "));
    }
    return out;
  };
  const jaccard = (a: Set<string>, b: Set<string>) => {
    let inter = 0;
    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    for (const x of small) if (large.has(x)) inter++;
    const uni = a.size + b.size - inter;
    return uni ? inter / uni : 0;
  };

  const buckets = new Map<string, number[]>(); // bucketKey -> indices
  const tokenCache: string[][] = [];
  const shingleCache: Set<string>[] = [];

  for (let i = 0; i < contents.length; i++) {
    const t = toTokens(contents[i] || "");
    tokenCache[i] = t;
    const first3 = t.slice(0, 3).join(" ");
    const lenBin = Math.round((contents[i] || "").length / 10);
    const key = `${first3}::${lenBin}`;
    const arr = buckets.get(key);
    if (arr) arr.push(i);
    else buckets.set(key, [i]);
  }

  const clusterSizes: number[] = [];
  for (const idxs of buckets.values()) {
    const reps: { repIndex: number; size: number; sig: Set<string> }[] = [];

    for (const i of idxs) {
      const sig = (shingleCache[i] ||= new Set(shingles(tokenCache[i])));
      let placed = false;
      let cmpCount = 0;

      for (let r = 0; r < reps.length && cmpCount < maxCmp; r++) {
        cmpCount++;
        const sim = jaccard(sig, reps[r].sig);
        if (sim >= threshold) {
          reps[r].size += 1;
          placed = true;
          break;
        }
      }
      if (!placed) {
        reps.push({ repIndex: i, size: 1, sig });
      }
    }

    for (const r of reps) clusterSizes.push(r.size);
  }

  return clusterSizes;
}

export const InsightsService = {
  async fetchCaptionsRange(range: InsightsRange): Promise<Captions[]> {
    const { searchQuery = "", searchType = "all" } = range;

    const startISO = toIsoString(range.startISO);
    const endISO = toIsoString(range.endISO);

    return CaptionService.fetchAllForChartUsingTableCriteria(
      { searchQuery, searchType, startISO, endISO },
      90
    );
  },

  buildSeries(rows: Captions[]): SeriesPoint[] {
    const key = (stamp?: string | Date | null) => {
      if (!stamp) return null;
      const d = typeof stamp === "string" ? new Date(stamp) : stamp;
      if (Number.isNaN(d?.getTime?.())) return null;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const m = new Map<string, number>();
    for (const c of rows) {
      const k = key((c as any).created_datetime_utc ?? null);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  },

  computeStats(rows: Captions[]): Stats {
    const total = rows.length;

    // Distinct users
    const userSet = new Set(rows.map((r) => r.profile_id).filter(Boolean));
    const distinctUsers = userSet.size;

    // Length
    const lens = rows.map((r) => (r.content ?? "").length).filter((n) => n > 0);
    const medianLen = median(lens);
    const sweetPct = lens.length
      ? Math.round((100 * lens.filter((n) => n >= SWEET_MIN && n <= SWEET_MAX).length) / lens.length)
      : 0;

    // "When" %
    const startsWithWhenCount = rows.reduce(
      (acc, r) => acc + (WHEN_RE.test(r.content ?? "") ? 1 : 0),
      0
    );
    const startsWithWhenPct = total ? (startsWithWhenCount / total) * 100 : 0;

    // Top starting trigrams coverage
    const contents = rows.map((r) => r.content ?? "").filter(Boolean);
    const freq = new Map<string, number>();
    for (const s of contents) {
      const toks = normText(s).split(" ");
      if (toks.length < 3) continue;
      const tri = toks.slice(0, 3).join(" ");
      freq.set(tri, (freq.get(tri) ?? 0) + 1);
    }
    const top10 = [...freq.values()].sort((a, b) => b - a).slice(0, 10);
    const topStartTriCoverage = contents.length
      ? Math.round((100 * top10.reduce((x, y) => x + y, 0)) / contents.length)
      : 0;

    // Repetition (near-dup heuristic buckets)
    const clusterSizes = clusterNearDuplicates(contents, { threshold: 0.85 });
    const multi = clusterSizes.filter(s => s >= 2);
    const clusterCount = multi.length;
    const largestCluster = multi.length ? Math.max(...multi) : 0;

    return {
      total,
      distinctUsers,
      medianLen,
      sweetPct,
      startsWithWhenPct,
      topStartTriCoverage,
      clusterCount,
      largestCluster,
    };
  },

  async exportCSVFromRange(range: InsightsRange, filename = "insights-export.csv") {
    const rows = await this.fetchCaptionsRange(range);
    const sanitize = (s: unknown) =>
      String(s ?? "").replaceAll('"', '""').replace(/\r?\n/g, " ");

    const header = [
      "ID",
      "Content",
      "Image ID",
      "Profile ID",
      "Created (UTC)",
      "Public",
    ].join(",");

    const lines = rows.map((c) => {
      const created =
        typeof (c as any).created_datetime_utc === "object"
          ? (c as any).created_datetime_utc?.toISOString?.() ?? ""
          : sanitize((c as any).created_datetime_utc);

      return [
        sanitize(c.id),
        sanitize(c.content),
        sanitize(c.image_id),
        sanitize(c.profile_id),
        created,
        String((c as any)?.is_public ?? ""),
      ]
        .map((v) => `"${v}"`)
        .join(",");
    });

    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
