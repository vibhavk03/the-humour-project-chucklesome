"use server";

// Read the experiment spine (experiments + experiment_scorecards +
// experiment_findings, toosoon migration 20260811000000) for the read-only
// /experiments page. Tables aren't in this repo's generated Database types yet
// — regenerate src/types/supabase.ts to retire the cast.
import { createClient } from "@/utils/supabase/server";

const untyped = (client: unknown) => client as { from: (table: string) => any };

export type ExperimentOverviewRow = {
  id: string;
  hypothesis: string;
  status: string;
  env: string;
  createdAt: string;
  decidedAt: string | null;
  verdict: string | null;
  // run side
  opsRunId: string | null;
  flavorSlug: string | null;
  imageSetSlug: string | null;
  runUrl: string | null;
  // study side
  studyId: number | null;
  studySlug: string | null;
  // scorecard (null until the study has votes)
  funnyRate: number | null;
  up: number | null;
  down: number | null;
  voters: number | null;
  nCaptions: number | null;
  target: number | null;
  targetMet: boolean | null;
  votesAreStudyOnly: boolean | null;
  findingsCount: number;
};

export type ListExperimentsResult = {
  ok: boolean;
  rows: ExperimentOverviewRow[];
  // True when the experiments tables don't exist yet (migration not run).
  missingTable: boolean;
  error?: string;
};

const isMissingTable = (error: { code?: string; message?: string }): boolean =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  /could not find the table/i.test(error.message ?? "");

// The ops pages live in toosoon; staging matrix host (v1 is staging-only).
const MATRIX_BASE = "https://matrix.almostcrackd.ai";

export async function listExperimentsOverviewAction(): Promise<ListExperimentsResult> {
  const supabase = await createClient();
  const sb = untyped(supabase);

  const { data: experiments, error } = await sb
    .from("experiments")
    .select("id, hypothesis, status, env, ops_run_id, study_id, verdict, created_datetime_utc, decided_datetime_utc")
    .order("created_datetime_utc", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error)) return { ok: true, rows: [], missingTable: true };
    return { ok: false, rows: [], missingTable: false, error: error.message };
  }
  const exps = (experiments ?? []) as Array<Record<string, unknown>>;
  if (exps.length === 0) return { ok: true, rows: [], missingTable: false };

  const [scorecardsRes, findingsRes] = await Promise.all([
    sb.from("experiment_scorecards").select("*"),
    sb.from("experiment_findings").select("experiment_id"),
  ]);
  const scorecards = new Map<string, Record<string, unknown>>(
    ((scorecardsRes.data ?? []) as Array<Record<string, unknown>>).map((s) => [String(s.experiment_id), s])
  );
  const findingsCount = new Map<string, number>();
  for (const f of (findingsRes.data ?? []) as Array<Record<string, unknown>>) {
    const k = String(f.experiment_id);
    findingsCount.set(k, (findingsCount.get(k) ?? 0) + 1);
  }

  const runIds = exps.map((e) => e.ops_run_id).filter(Boolean);
  const runs = new Map<string, Record<string, unknown>>();
  if (runIds.length) {
    const { data: runRows } = await sb
      .from("ops_runs")
      .select("id, humor_flavor_id, flavor_slug, study_image_set_slug")
      .in("id", runIds);
    for (const r of (runRows ?? []) as Array<Record<string, unknown>>) runs.set(String(r.id), r);
  }

  const studyIds = exps.map((e) => e.study_id).filter((v) => v != null);
  const studies = new Map<number, string | null>();
  if (studyIds.length) {
    const { data: studyRows } = await supabase.from("studies").select("id, slug").in("id", studyIds as number[]);
    for (const s of studyRows ?? []) studies.set(s.id as number, (s.slug as string | null) ?? null);
  }

  const rows: ExperimentOverviewRow[] = exps.map((e) => {
    const id = String(e.id);
    const sc = scorecards.get(id);
    const run = e.ops_run_id ? runs.get(String(e.ops_run_id)) : undefined;
    const studyId = e.study_id != null ? Number(e.study_id) : null;
    const goal = (e as { goal_metric?: unknown }).goal_metric as Record<string, unknown> | undefined;
    return {
      id,
      hypothesis: String(e.hypothesis ?? ""),
      status: String(e.status ?? "open"),
      env: String(e.env ?? "staging"),
      createdAt: String(e.created_datetime_utc ?? ""),
      decidedAt: e.decided_datetime_utc ? String(e.decided_datetime_utc) : null,
      verdict: e.verdict ? String(e.verdict) : null,
      opsRunId: e.ops_run_id ? String(e.ops_run_id) : null,
      flavorSlug: run ? ((run.flavor_slug as string | null) ?? null) : null,
      imageSetSlug: run ? ((run.study_image_set_slug as string | null) ?? null) : null,
      runUrl:
        run && run.humor_flavor_id != null && e.ops_run_id
          ? `${MATRIX_BASE}/humor-flavor/${run.humor_flavor_id}/ops/runs/${e.ops_run_id}`
          : null,
      studyId,
      studySlug: studyId != null ? (studies.get(studyId) ?? null) : null,
      funnyRate: sc && sc.funny_rate != null ? Number(sc.funny_rate) : null,
      up: sc && sc.up != null ? Number(sc.up) : null,
      down: sc && sc.down != null ? Number(sc.down) : null,
      voters: sc && sc.voters != null ? Number(sc.voters) : null,
      nCaptions: sc && sc.n_captions != null ? Number(sc.n_captions) : null,
      target: sc && sc.target != null ? Number(sc.target) : (goal?.target != null ? Number(goal.target) : null),
      targetMet: sc && sc.target_met != null ? Boolean(sc.target_met) : null,
      votesAreStudyOnly: sc && sc.votes_are_study_only != null ? Boolean(sc.votes_are_study_only) : null,
      findingsCount: findingsCount.get(id) ?? 0,
    };
  });

  return { ok: true, rows, missingTable: false };
}
