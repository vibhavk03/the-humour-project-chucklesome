import type { StudyAnalytics } from '@/services/study-results.service'

export default function StudyRatingOpportunities({ analytics }: { analytics: StudyAnalytics }) {
  const metrics = analytics.opportunities
  const number = (value: number | null) => value === null ? '—' : value.toLocaleString()
  const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`
  const outcomes = [
    { label: 'Funny', count: metrics.funnyRatings, color: 'bg-primary' },
    { label: 'Not funny', count: metrics.notFunnyRatings, color: 'bg-slate-500' },
    ...(metrics.otherRatings ? [{ label: 'Other recorded ratings', count: metrics.otherRatings, color: 'bg-amber-500' }] : []),
    { label: 'Potential unrated opportunities', count: metrics.potentialUnrated, color: 'bg-muted-foreground/30' },
  ]

  return (
    <section aria-labelledby="study-opportunities-heading" className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-2">
      <div className="space-y-1">
        <h3 id="study-opportunities-heading" className="font-semibold">Available captions and feedback</h3>
        <p className="text-sm text-muted-foreground">
          Compare Funny ratings with the potential ratings available across the study.
          Each participant can contribute one counted rating per caption.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm text-muted-foreground">Available captions</dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">{number(metrics.availableCaptions)}</dd>
          <dd className="mt-2 text-xs text-muted-foreground">Distinct captions currently attached to this study</dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm text-muted-foreground">Potential rating opportunities</dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">{number(metrics.potentialRatings)}</dd>
          <dd className="mt-2 text-xs text-muted-foreground">
            {metrics.participationAvailable
              ? `${number(metrics.availableCaptions)} captions × ${number(metrics.observedParticipants)} known participants · Estimate`
              : 'Participant cohort unavailable'}
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm text-muted-foreground">Ratings given</dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">{number(metrics.ratingsGiven)}</dd>
          <dd className="mt-2 text-xs text-muted-foreground">
            Rating coverage: {percent(metrics.ratingCoveragePercent)} of potential opportunities
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm text-muted-foreground">Funny ratings</dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">{number(metrics.funnyRatings)}</dd>
          <dd className="mt-2 text-xs text-muted-foreground">
            {percent(metrics.funnyOfPotentialPercent)} of potential opportunities
            <span className="mt-1 block">{percent(metrics.funnyOfRatedPercent)} of ratings given</span>
          </dd>
        </div>
      </dl>
      {metrics.availableCaptions > 0 && !metrics.participationAvailable ? (
        <p role="status" className="text-sm text-muted-foreground">
          Participation records could not be loaded. Submitted and Funny rating counts are available;
          opportunity estimates and coverage percentages are unavailable.
        </p>
      ) : metrics.availableCaptions > 0 && metrics.observedParticipants === 0 ? (
        <p className="text-sm text-muted-foreground">No starters or raters are recorded yet. A coverage percentage will appear when participants are known.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        The estimate assumes every recorded starter or rater could rate every caption currently attached to this study.
        It does not measure actual views or reconstruct historical assignments. Missing participation records can reduce the estimate.
      </p>
      {metrics.potentialRatings !== null && metrics.potentialRatings > 0 && (
        <div className="space-y-3 rounded-lg border bg-background p-4">
          <h4 className="text-sm font-medium">Outcomes across potential opportunities</h4>
          <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-muted">
            {outcomes.map(outcome => (
              <div key={outcome.label} className={`${outcome.color} h-full transition-all duration-500`}
                style={{ width: `${(outcome.count ?? 0) / metrics.potentialRatings! * 100}%` }} />
            ))}
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {outcomes.map(outcome => (
              <li key={outcome.label} className="flex items-center justify-between gap-3">
                <span>{outcome.label}</span>
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {number(outcome.count)} · {percent((outcome.count ?? 0) / metrics.potentialRatings! * 100)}
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Potential unrated opportunities</span> estimates
              how many participant–caption pairs have no submitted rating: potential rating opportunities minus ratings given.
            </p>
            <p>
              For example, 100 captions × 10 known participants = 1,000 potential ratings.
              If 600 ratings were given, 400 potential unrated opportunities remain.
            </p>
            <p>
              This assumes every known participant could rate every current caption.
              It does not mean those captions were actually shown or marked Not funny.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
