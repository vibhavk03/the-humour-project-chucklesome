'use client'

import type { ReactNode } from 'react'
import { Eye, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { CaptionReviewItem } from '@/types/caption-review'

export default function StudyPreview({
  name,
  items,
  buttonLabel = 'Open private preview',
  description = 'This study is not publicly available. It stays private until you click Make public.',
}: {
  name: string
  items: CaptionReviewItem[]
  buttonLabel?: string
  description?: ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={items.length === 0}
        >
          <Eye className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto"
        {...(!description ? { 'aria-describedby': undefined } : {})}
      >
        <DialogHeader className="pr-6">
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5" />
            Private study preview
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <p className="break-words text-sm font-medium">
          {name} · {items.length} captions
        </p>
        <div className="space-y-6">
          {items.map((item) => (
            <figure
              key={item.id}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <figcaption className="whitespace-pre-wrap text-lg leading-relaxed">
                {item.caption}
              </figcaption>
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt="Image for the caption above"
                  loading="lazy"
                  className="max-h-[55dvh] w-full rounded-md object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No image available.
                </p>
              )}
            </figure>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
