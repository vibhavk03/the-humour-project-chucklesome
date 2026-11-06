'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ImageIcon, Text } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import CaptionReviewGroups from '@/components/study/CaptionReviewGroups'
import {
  buildCaptionArrayGroups,
  CAPTION_ARRAY_REVIEW_LIMIT,
  requestCaptionArrayDedupe,
  type CaptionArrayGroups,
} from '@/services/caption-array-dedupe.service'
import type { CaptionReviewItem } from '@/types/caption-review'
import {
  getCaptionReviewScopeKey,
  type DedupeLoadStatus,
} from '@/utils/study-dedupe'

export type CaptionArrayReviewHandle = { cancel: () => void }

const CaptionArrayReview = forwardRef<
  CaptionArrayReviewHandle,
  {
    items: CaptionReviewItem[]
    selectedIds: Set<string>
    onSelectionChanged: (ids: Set<string>) => void
    onStatusChanged: (status: DedupeLoadStatus, scope: string) => void
    loadingBlocked: boolean
    disabled?: boolean
  }
>(function CaptionArrayReview(
  {
    items,
    selectedIds,
    onSelectionChanged,
    onStatusChanged,
    loadingBlocked,
    disabled,
  },
  ref
) {
  const [result, setResult] = useState<{
    scope: string
    groups: CaptionArrayGroups
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'images' | 'captions'>('images')
  const scope = getCaptionReviewScopeKey(items)
  const latestScope = useRef(scope)
  latestScope.current = scope
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      cancel: () => {
        requestId.current += 1
        controllerRef.current?.abort()
      },
    }),
    []
  )

  useEffect(() => {
    const id = ++requestId.current
    const controller = new AbortController()
    controllerRef.current = controller
    const current = () =>
      !controller.signal.aborted &&
      requestId.current === id &&
      latestScope.current === scope
    setResult(null)
    setError(null)
    setIsLoading(false)
    if (
      loadingBlocked ||
      !items.length ||
      items.length > CAPTION_ARRAY_REVIEW_LIMIT
    ) {
      onStatusChanged('waiting', scope)
      return () => controller.abort()
    }
    setIsLoading(true)
    onStatusChanged('loading', scope)
    void requestCaptionArrayDedupe(
      items.map((item) => item.id),
      controller.signal
    )
      .then((groups) => {
        if (!current()) return
        setResult({ scope, groups })
        onStatusChanged('ready', scope)
      })
      .catch((cause) => {
        if (!current()) return
        setError(
          cause instanceof Error && cause.name !== 'AbortError'
            ? cause.message
            : 'Review timed out.'
        )
        onStatusChanged('error', scope)
      })
      .finally(() => {
        if (current()) setIsLoading(false)
      })
    return () => controller.abort()
    // Scope contains every ID and saved caption; image/selection changes do not regroup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, loadingBlocked, onStatusChanged])

  const groups = useMemo(
    () =>
      result?.scope === scope
        ? buildCaptionArrayGroups(result.groups, items)
        : [],
    [result, scope, items]
  )
  const toggle = (id: string) => {
    if (disabled || loadingBlocked) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChanged(next)
  }
  const setGroupSelection = (ids: string[], included: boolean) => {
    if (disabled || loadingBlocked) return
    const next = new Set(selectedIds)
    for (const id of ids) {
      if (included) next.add(id)
      else next.delete(id)
    }
    onSelectionChanged(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-lg text-muted-foreground">
            Captions are grouped based on similarity. Choose which captions to keep in the study.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value === 'images' || value === 'captions') setViewMode(value)
            }}
            variant="outline"
            size="sm"
            disabled={disabled}
            className="rounded-md border border-border/60 p-0.5"
          >
            <ToggleGroupItem
              value="images"
              aria-label="Show images and captions"
              className="h-7 gap-1 px-2 text-xs [&_svg]:size-3.5"
            >
              <ImageIcon />
              Images
            </ToggleGroupItem>
            <ToggleGroupItem
              value="captions"
              aria-label="Show captions only"
              className="h-7 gap-1 px-2 text-xs [&_svg]:size-3.5"
            >
              <Text />
              Captions only
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {items.length > CAPTION_ARRAY_REVIEW_LIMIT ? (
        <p className="text-sm text-muted-foreground">
          Optional review supports up to {CAPTION_ARRAY_REVIEW_LIMIT} captions.
          Remove captions in step 2, or choose No in step 3 to keep all
          captions.
        </p>
      ) : loadingBlocked ? (
        <p className="text-sm text-muted-foreground">
          Waiting for caption changes to finish.
        </p>
      ) : isLoading ? (
        <p className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Grouping similar captions…
        </p>
      ) : error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">{error}</p>
          <p>Choose No in step 3 to keep all captions.</p>
        </div>
      ) : groups.length ? (
        <CaptionReviewGroups
          groups={groups}
          selectedIds={selectedIds}
          onToggle={toggle}
          onGroupSelectionChange={setGroupSelection}
          groupActions="reset"
          viewMode={viewMode}
          disabled={disabled}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No captions to review.</p>
      )}
    </div>
  )
})

export default CaptionArrayReview
