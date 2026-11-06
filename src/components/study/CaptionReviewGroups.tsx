'use client'

import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CaptionPreview from '@/components/study/CaptionPreview'
import { cn } from '@/lib/utils'
import type { CaptionReviewGroup } from '@/types/caption-review'
import {
  getCaptionImageSelectionCounts,
  getDedupeImageKey,
} from '@/utils/study-dedupe'

export default function CaptionReviewGroups({
  groups,
  selectedIds,
  onToggle,
  onGroupSelectionChange,
  groupActions = 'toggle',
  viewMode,
  disabled = false,
}: {
  groups: CaptionReviewGroup[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onGroupSelectionChange: (ids: string[], included: boolean) => void
  groupActions?: 'toggle' | 'reset'
  viewMode: 'images' | 'captions'
  disabled?: boolean
}) {
  const imageSelectionCounts = useMemo(
    () => getCaptionImageSelectionCounts(groups, selectedIds),
    [groups, selectedIds]
  )
  return (
    <div className="space-y-3">
      {groups.map((group, groupIndex) => {
        const hasIncludedCaptions = group.captions.some((caption) =>
          selectedIds.has(caption.id)
        )
        const groupIds = group.captions.map((caption) => caption.id)
        const groupAction =
          groupActions === 'toggle' && hasIncludedCaptions ? 'remove' : 'add'
        return (
          <div
            key={group.id}
            className={
              group.isOutliers
                ? 'space-y-1 pt-1'
                : 'overflow-hidden rounded-lg border border-border bg-muted/20'
            }
          >
            <div
              className={
                group.isOutliers
                  ? 'px-2.5 py-1.5'
                  : 'border-b border-border bg-muted/40 px-3 py-2'
              }
            >
              <div className="flex flex-wrap items-center justify-start gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {group.isOutliers
                    ? 'Ungrouped captions'
                    : `Group ${groupIndex + 1}: ${group.name}`}
                </p>
                <div className="flex min-w-0 max-w-full items-center gap-2">
                  {groupActions === 'toggle' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onGroupSelectionChange(
                          groupIds,
                          groupAction === 'add'
                        )
                      }
                      disabled={disabled || group.captions.length === 0}
                      className={cn(
                        'h-auto min-h-7 min-w-0 whitespace-normal px-2 py-1 text-xs',
                        groupAction === 'remove'
                          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70 dark:hover:text-red-200'
                          : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70 dark:hover:text-blue-200'
                      )}
                    >
                      {group.isOutliers
                        ? `${groupAction} all ungrouped captions`
                        : `${groupAction} all captions from this group`}
                    </Button>
                  ) : null}
                  {groupActions === 'reset' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onGroupSelectionChange(groupIds, false)}
                      disabled={disabled || !hasIncludedCaptions}
                      aria-label={
                        group.isOutliers
                          ? 'Reset captions below'
                          : `Reset group ${groupIndex + 1}`
                      }
                      title={
                        group.isOutliers
                          ? 'Reset captions below to no captions selected'
                          : 'Reset this group to no captions selected'
                      }
                      className="h-7 shrink-0 gap-1.5 px-2 text-xs [&_svg]:size-3.5"
                    >
                      <RotateCcw aria-hidden="true" />
                      {group.isOutliers ? 'Reset captions below' : 'Reset group'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-2.5 lg:grid-cols-2">
              {group.captions.map((caption) => {
                const included = selectedIds.has(caption.id)
                const imageKey = getDedupeImageKey(caption)
                const usage = imageKey
                  ? imageSelectionCounts.get(imageKey)
                  : null
                return (
                  <CaptionPreview
                    key={`${group.id}-${caption.id}`}
                    caption={caption.caption}
                    imageUrl={caption.imageUrl}
                    imageUsageCount={
                      usage && usage.total > 1 ? usage.selected : undefined
                    }
                    className={cn(
                      'h-full rounded-md border border-border/70 bg-background p-2.5',
                      !included && 'bg-muted/50'
                    )}
                  >
                    <div
                      className={cn(
                        'grid min-w-0 items-start gap-3',
                        viewMode === 'images'
                          ? 'grid-cols-[6rem_minmax(0,1fr)]'
                          : 'grid-cols-1'
                      )}
                    >
                      {viewMode === 'images' ? (
                        <div
                          className={cn(
                            'row-span-2 flex h-24 w-24 items-center justify-center overflow-hidden rounded border border-border/60 bg-muted/20',
                            !included && 'opacity-50 grayscale'
                          )}
                        >
                          {caption.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={caption.imageUrl}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-center text-[10px] text-muted-foreground">
                              No image
                            </span>
                          )}
                        </div>
                      ) : null}
                      <p
                        className={cn(
                          'min-w-0 whitespace-pre-wrap break-words text-lg leading-snug text-foreground',
                          !included && 'opacity-50'
                        )}
                      >
                        {caption.caption || '-'}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onToggle(caption.id)}
                        disabled={disabled}
                        aria-label={`${included ? 'Remove from' : 'Add to'} study: ${caption.caption}`}
                        className={cn(
                          'pointer-events-auto relative z-10 h-7 justify-self-end px-2 text-xs',
                          viewMode === 'images' && 'col-start-2',
                          included
                            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70 dark:hover:text-red-200'
                            : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70 dark:hover:text-blue-200'
                        )}
                      >
                        {included ? 'Remove from study' : 'Add to study'}
                      </Button>
                    </div>
                  </CaptionPreview>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
