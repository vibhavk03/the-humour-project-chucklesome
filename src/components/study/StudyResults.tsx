'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { StudyResultsService, type StudyAnalytics } from '@/services/study-results.service'
import StudyOverview from '@/components/study/StudyOverview'
import StudyFlavorBreakdown, { FLAVOR_SOURCE_LABELS } from '@/components/study/StudyFlavorBreakdown'
import CaptionThumbnail from '@/components/study/CaptionThumbnail'

const PAGE_SIZE = 20

export default function StudyResults({ studyId }: { studyId: number }) {
  const [analytics, setAnalytics] = useState<StudyAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const controller = new AbortController()
    void StudyResultsService.getAnalytics(studyId, controller.signal).then(data => {
      if (!controller.signal.aborted) setAnalytics(data)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load study results.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [studyId, refresh])

  function reload() {
    setLoading(true)
    setError(null)
    setAnalytics(null)
    setPage(1)
    setRefresh(value => value + 1)
  }

  const rows = analytics?.rows ?? []
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const visible = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const totalRatings = rows.reduce((total, row) => total + row.totalRatings, 0)

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>Study results</CardTitle>
            <CardDescription>
              The caption leaderboard’s Funny % is the share of ratings given that were marked Funny.
              Each participant’s latest rating per caption in this study counts once.
              Ratings are grouped as Funny or Not funny.
            </CardDescription>
          </div>
          <Button variant="outline" disabled={loading} onClick={reload}>
            Refresh results
          </Button>
        </div>
        {loading ? (
          <div role="status" className="py-10 text-center text-sm text-muted-foreground">
            <div aria-hidden="true" className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading study results…
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3 rounded-md border border-destructive/30 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={reload}>Try again</Button>
          </div>
        ) : analytics ? (
          <>
            <StudyOverview analytics={analytics} />
            <StudyFlavorBreakdown analytics={analytics} />
            <h2 className="border-t pt-4 text-xl font-semibold">Caption leaderboard</h2>
            {!rows.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No captions are attached to this study yet.</p>
            ) : <>
            <p className="text-sm text-muted-foreground" role="status">
              {rows.length} captions · {totalRatings} ratings
              {totalRatings === 0 ? '. No ratings yet.' : '. Sorted by Funny %, highest first. Compare rating counts before drawing conclusions.'}
            </p>
            <div className="table-shell overflow-x-auto">
              <table className="table-base min-w-full">
                <caption className="sr-only">Study caption results, sorted by Funny % descending, then total ratings descending.</caption>
                <thead>
                  <tr>
                    <th scope="col">Id</th>
                    <th scope="col">Image</th>
                    <th scope="col">Caption</th>
                    <th scope="col">Humor flavor</th>
                    <th scope="col" className="text-right">Total ratings</th>
                    <th scope="col" className="text-right" aria-sort="descending">Funny %</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => (
                    <tr key={row.captionId}>
                      <td className="font-sans text-xs">
                        <Link className="text-primary underline underline-offset-4" href={`/caption/${row.captionId}`}>{row.captionId}</Link>
                      </td>
                      <td>
                        <CaptionThumbnail imageId={row.imageId} url={row.imageUrl} description={row.imageDescription} />
                      </td>
                      <td className="min-w-64 max-w-xl whitespace-pre-wrap break-words">{row.content}</td>
                      <td>
                        {row.flavor}
                        <span className="mt-1 block text-xs text-muted-foreground">{FLAVOR_SOURCE_LABELS[row.attribution.source]}</span>
                      </td>
                      <td className="text-right tabular-nums">{row.totalRatings}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {row.funnyPercent === null ? 'No ratings' : `${row.funnyPercent.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length} captions</span>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Previous</Button>
                  <span>Page {safePage} of {pages}</span>
                  <Button variant="outline" size="sm" disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>Next</Button>
                </div>
              </div>
            )}
            </>}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
