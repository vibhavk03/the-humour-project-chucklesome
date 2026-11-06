'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExternalImageReplacementJobsService } from '@/services/external-image-replacement-jobs.service'
import type { ExternalImageReplacementAlerts as Alerts } from '@/types/external-image-replacement-job'

export default function ExternalImageReplacementAlerts() {
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [dismissing, setDismissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    let busy = false
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    const poll = async () => {
      if (stopped || busy) return
      clearTimeout(timer)
      if (!document.hidden) {
        busy = true
        controller = new AbortController()
        try {
          const data = await ExternalImageReplacementJobsService.alerts(
            controller.signal
          )
          if (!stopped) setAlerts(data)
        } catch {
          /* A temporary outage retains the last known alert. */
        } finally {
          busy = false
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), 30_000)
    }
    const focus = () => void poll()
    void poll()
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => {
      stopped = true
      controller?.abort()
      clearTimeout(timer)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [refreshVersion])

  const dismiss = async () => {
    if (!alerts || dismissing) return
    setDismissing(true)
    setError(null)
    try {
      await ExternalImageReplacementJobsService.acknowledge(alerts.checkedAt)
      setAlerts(null)
      setRefreshVersion((value) => value + 1)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not dismiss this alert. Try again.'
      )
    } finally {
      setDismissing(false)
    }
  }
  if (!alerts?.failedAlertCount) return null
  const count = alerts.failedAlertCount
  return (
    <div
      role="alert"
      className="mb-4 animate-in fade-in-0 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <span className="flex-1">
          {count} image replacement {count === 1 ? 'job failed' : 'jobs failed'}
          . Your captions are saved and still use the original image URLs.
        </span>
        <Link
          href="/external-image-replacement-jobs?status=failed&mine=true"
          className="text-primary underline underline-offset-2"
        >
          View failed jobs
        </Link>
        <Button
          variant="ghost"
          size="sm"
          disabled={dismissing}
          onClick={() => void dismiss()}
        >
          Dismiss
        </Button>
      </div>
      {error ? <p className="mt-2 text-destructive">{error}</p> : null}
    </div>
  )
}
