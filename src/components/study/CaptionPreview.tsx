'use client'

import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export default function CaptionPreview({
  caption,
  imageUrl,
  imageUsageCount,
  children,
  className,
}: {
  caption: string
  imageUrl: string | null
  imageUsageCount?: number
  children: ReactNode
  className?: string
}) {
  return (
    <Dialog>
      <div
        className={cn(
          'relative isolate min-w-0 rounded-md text-left transition-colors hover:bg-muted/30',
          className
        )}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Enlarge image and caption: ${caption}`}
            className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </DialogTrigger>
        {/* Controls opt back into pointer events above the full-card trigger. */}
        <div className="pointer-events-none contents">{children}</div>
      </div>
      <DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader className="pr-6">
          <DialogTitle>Caption preview</DialogTitle>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-lg font-medium leading-relaxed">
          {caption || 'No caption'}
        </p>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Image for the caption above"
            className="max-h-[60dvh] w-full rounded-lg object-contain"
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No image available.
          </p>
        )}
        {imageUsageCount !== undefined ? (
          <p className="text-xs text-muted-foreground">
            {imageUsageCount} {imageUsageCount === 1 ? 'caption' : 'captions'} with
            this image included in the study.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
