import Link from 'next/link'
import type { StudyAnalytics } from '@/services/study-results.service'

export default function StudyOverview({ analytics }: { analytics: StudyAnalytics }) {
  const { rows, overview } = analytics
  const { ratingsPerCaption: counts } = overview
  const ordered = [...rows].sort((a, b) => b.totalRatings - a.totalRatings || a.captionId.localeCompare(b.captionId))
  const format = (value: number | null) => value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 })

  return (
    <section aria-labelledby="study-overview-heading" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2">
      <div className="space-y-1">
        <h2 id="study-overview-heading" className="text-xl font-semibold">Study overview</h2>
        <p className="text-sm text-muted-foreground">
          All metrics use each participant’s latest rating per caption in this study.
          Participants are people who submitted a counted rating.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm text-muted-foreground">Unique participants</dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">{overview.uniqueParticipants.toLocaleString()}</dd>
          <dd className="mt-2 text-xs text-muted-foreground">Across {overview.totalRatings.toLocaleString()} counted ratings</dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm text-muted-foreground">Rated-caption coverage</dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">
            {overview.coveragePercent === null ? '—' : `${format(overview.coveragePercent)}%`}
          </dd>
          <dd className="mt-2 text-xs text-muted-foreground">
            {overview.ratedCaptions.toLocaleString()} of {overview.totalCaptions.toLocaleString()} captions rated ·{' '}
            {(overview.totalCaptions - overview.ratedCaptions).toLocaleString()} unrated
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm text-muted-foreground">Average ratings per caption</dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">{format(counts.average)}</dd>
          <dd className="mt-2 text-xs text-muted-foreground">
            Median {format(counts.median)} · Range {format(counts.min)}–{format(counts.max)}
            <span className="mt-1 block">Includes unrated captions</span>
          </dd>
        </div>
      </dl>
      {overview.totalRatings === 0 && (
        <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {rows.length ? 'No ratings yet. Participant counts and the charts will update as feedback arrives.' : 'Attach captions to this study to start tracking coverage and feedback.'}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="study-rating-distribution-heading" className="rounded-lg border bg-background p-4">
          <h3 id="study-rating-distribution-heading" className="font-semibold">Rating distribution</h3>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">Count and share of all counted ratings for each response.</p>
          <ul className="space-y-3">
            {overview.distribution.map(bucket => (
              <li key={bucket.value}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span>{bucket.label}</span>
                  <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {bucket.count.toLocaleString()} · {bucket.percent.toFixed(1)}%
                  </span>
                </div>
                <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${bucket.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="study-caption-counts-heading" className="rounded-lg border bg-background p-4">
          <h3 id="study-caption-counts-heading" className="font-semibold">Ratings per caption</h3>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">All captions, most rated first. Compare counts to check how evenly feedback is spread.</p>
          {ordered.length ? (
            <div className="max-h-80 overflow-y-auto pr-2" tabIndex={0} role="region" aria-label="Rating counts for all study captions">
              <ul className="space-y-3">
                {ordered.map(row => (
                  <li key={row.captionId}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <Link
                        href={`/caption/${row.captionId}`}
                        className="truncate text-primary underline underline-offset-4"
                        title={`${row.captionId}: ${row.content}`}
                        aria-label={`${row.content} (caption ${row.captionId})`}
                      >{row.content}</Link>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{row.totalRatings.toLocaleString()}</span>
                    </div>
                    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70 transition-all duration-500" style={{ width: `${counts.max ? row.totalRatings / counts.max * 100 : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-sm text-muted-foreground">No captions attached.</p>}
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        Use audience size, coverage, and rating balance together when assessing this leaderboard.
      </p>
    </section>
  )
}
