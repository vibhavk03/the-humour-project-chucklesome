import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { FlavorSource, StudyAnalytics } from '@/services/study-results.service'

export const FLAVOR_SOURCE_LABELS: Record<FlavorSource, string> = {
  direct: 'Recorded flavor', imported: 'Imported label', unknown: 'Unknown',
}

const SOURCE_DESCRIPTIONS: Record<FlavorSource, string> = {
  direct: 'Flavor saved directly on the caption',
  imported: 'Flavor name or source ID supplied with imported captions',
  unknown: 'No saved flavor attribution',
}

export default function StudyFlavorBreakdown({ analytics }: { analytics: StudyAnalytics }) {
  const { coverage, groups } = analytics.flavors
  const hasRatings = analytics.overview.totalRatings > 0

  return (
    <section aria-labelledby="study-flavors-heading" className="space-y-4 border-t pt-4 animate-in fade-in-0 slide-in-from-bottom-2">
      <div className="space-y-1">
        <h2 id="study-flavors-heading" className="text-xl font-semibold">Flavor breakdown</h2>
        <p className="text-sm text-muted-foreground">
          See which flavors are represented and how much feedback each received.
          Imported labels stay separate from recorded flavors, even when their names match.
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold">Attribution coverage</h3>
        <dl className="grid gap-3 sm:grid-cols-3">
          {coverage.map(item => (
            <div key={item.source} className="rounded-lg border bg-background p-4">
              <dt className="text-sm text-muted-foreground">{FLAVOR_SOURCE_LABELS[item.source]}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">
                {item.captions.toLocaleString()}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {item.percent === null ? '—' : `${item.percent.toFixed(1)}%`}
                </span>
              </dd>
              <dd className="mt-2 text-xs text-muted-foreground">{SOURCE_DESCRIPTIONS[item.source]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">Percentages cover all distinct captions in this study, including unrated captions.</p>
      </div>
      {!groups.length ? (
        <p className="text-sm text-muted-foreground">No captions attached yet. Flavor summaries will appear when captions are added.</p>
      ) : (
        <>
          {groups.every(group => group.attribution.source === 'unknown') ? (
            <p className="text-sm text-muted-foreground">No flavor attribution is available. All captions and their feedback are included in Unknown.</p>
          ) : groups.length === 1 ? (
            <p className="text-sm text-muted-foreground">This study has one flavor group. Its caption composition and feedback are summarized below.</p>
          ) : (
            <p className="text-sm text-muted-foreground">{groups.length} flavor groups, including any imported or unknown attribution.</p>
          )}
          {!hasRatings && (
            <p className="text-sm text-muted-foreground">No ratings yet. Caption composition is available; feedback metrics will update as ratings arrive.</p>
          )}
          <div className="table-shell overflow-x-auto">
            <table className="table-base min-w-full">
              <caption className="sr-only">Study flavor groups with attribution source, caption coverage, unique participants and counted rating distribution.</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Humor flavor</th>
                  <th scope="col">Attribution</th>
                  <th scope="col" className="text-right">Captions</th>
                  <th scope="col" className="text-right">Rated captions</th>
                  <th scope="col" className="text-right">Participants</th>
                  <th scope="col" className="text-right">Ratings</th>
                  <th scope="col">Rating distribution</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <tr key={group.attribution.key}>
                    <td className="font-sans text-xs">
                      {group.attribution.source === 'direct' ? (
                        <Link className="text-primary underline underline-offset-4" href={`/humor-flavor/${group.attribution.flavorId}/steps`}>
                          {group.attribution.flavorId}
                        </Link>
                      ) : group.attribution.importedId ? `Source ${group.attribution.importedId}` : '—'}
                    </td>
                    <td className="min-w-48 max-w-xs break-words font-medium">{group.attribution.label}</td>
                    <td><Badge variant="outline">{FLAVOR_SOURCE_LABELS[group.attribution.source]}</Badge></td>
                    <td className="text-right tabular-nums">{group.captions.toLocaleString()}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {group.ratedCaptions.toLocaleString()} / {group.captions.toLocaleString()}
                      <span className="block text-xs text-muted-foreground">{group.coveragePercent.toFixed(1)}%</span>
                    </td>
                    <td className="text-right tabular-nums">{group.uniqueParticipants.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{group.totalRatings.toLocaleString()}</td>
                    <td className="min-w-64">
                      {group.totalRatings === 0 ? <span className="text-sm text-muted-foreground">No ratings yet</span> : (
                        <details>
                          <summary className="cursor-pointer text-sm text-primary underline underline-offset-4">View rating distribution for {group.attribution.label}</summary>
                          <ul className="mt-3 space-y-2">
                            {group.distribution.map(bucket => (
                              <li key={bucket.value}>
                                <div className="mb-1 flex justify-between gap-3 text-xs">
                                  <span>{bucket.label}</span>
                                  <span className="whitespace-nowrap tabular-nums">{bucket.count.toLocaleString()} · {bucket.percent.toFixed(1)}%</span>
                                </div>
                                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${bucket.percent}%` }} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Each participant’s latest rating per caption counts once. Distributions show Funny and Not funny ratings within that group.
            A participant may rate several groups, so participant counts across groups should not be added together.
            Different images and sample sizes can affect comparisons.
          </p>
        </>
      )}
    </section>
  )
}
