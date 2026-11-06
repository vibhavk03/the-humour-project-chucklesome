"use client";

// Read-only view of the experiment spine: one row per turn of the humor
// improvement crank (hypothesis → ops run → study → votes → verdict).
// Data: experiments + experiment_scorecards + experiment_findings (staging).
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CopyStudyLinkButton } from "@/components/study/CopyStudyLinkButton";
import { getStudySiteUrl } from "@/utils/study-site";
import { listExperimentsOverviewAction, type ExperimentOverviewRow } from "./actions";

const statusStyles: Record<string, string> = {
  open: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  generated: "border-primary/30 bg-primary/10 text-primary",
  rated: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  decided: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  abandoned: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ExperimentsPage() {
  const [rows, setRows] = useState<ExperimentOverviewRow[]>([]);
  const [missingTable, setMissingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void listExperimentsOverviewAction().then((res) => {
      if (!alive) return;
      if (!res.ok) setError(res.error ?? "Could not load experiments.");
      setMissingTable(res.missingTable);
      setRows(res.rows);
      setIsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Experiments</h1>
        <p className="page-subtitle">
          One row per turn of the improvement loop: hypothesis → ops run → study → votes →
          verdict. Declare experiments here-abouts (SQL for now), attach them in Quick Study,
          and read the funny-rate against the goal.
        </p>
      </div>

      {isLoading ? (
        <div className="page-card py-16 text-center">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : missingTable ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            The experiments tables don&apos;t exist in this database yet — run the toosoon
            migration <code className="rounded bg-muted px-1">20260811000000_experiments.sql</code>.
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No experiments yet. Insert a row with a hypothesis, run the batch on the ops page,
            then attach it in Quick Study.
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Hypothesis</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Run</th>
                  <th className="px-4 py-3">Study</th>
                  <th className="px-4 py-3 text-right">Funny rate</th>
                  <th className="px-4 py-3 text-right">Votes</th>
                  <th className="px-4 py-3 text-right">Findings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <div>{r.hypothesis}</div>
                      {r.verdict && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Verdict: {r.verdict}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={statusStyles[r.status] ?? ""}>
                        {r.status}
                      </Badge>
                      {r.env !== "staging" && (
                        <Badge variant="outline" className="ml-1">{r.env}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.opsRunId ? (
                        r.runUrl ? (
                          <a
                            href={r.runUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {[r.flavorSlug, r.imageSetSlug].filter(Boolean).join(" × ") ||
                              r.opsRunId.slice(0, 8)}
                          </a>
                        ) : (
                          <span className="font-mono text-xs">{r.opsRunId.slice(0, 8)}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.studySlug && r.studyId != null ? (
                        <div className="flex items-center gap-1">
                          <a
                            href={getStudySiteUrl(r.studyId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {r.studySlug}
                          </a>
                          <CopyStudyLinkButton url={getStudySiteUrl(r.studyId)} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {r.funnyRate != null ? (
                        <span
                          className={
                            r.targetMet
                              ? "font-semibold text-emerald-600"
                              : "font-semibold text-destructive"
                          }
                        >
                          {(r.funnyRate * 100).toFixed(0)}%
                          {r.target != null && (
                            <span className="ml-1 font-normal text-muted-foreground">
                              / {(r.target * 100).toFixed(0)}%
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">no votes</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                      {r.up != null && (r.up > 0 || (r.down ?? 0) > 0) ? (
                        <>
                          {r.up}↑ {r.down}↓
                          <span className="ml-1 text-xs">
                            ({r.voters} voter{r.voters === 1 ? "" : "s"})
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {r.findingsCount > 0 ? r.findingsCount : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
