'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ImageOff } from 'lucide-react'

export default function CaptionThumbnail({ imageId, url, description }: {
  imageId: string | null
  url: string | null
  description: string | null
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  let usableUrl: string | null = null
  if (url) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') usableUrl = url
    } catch { /* Missing or invalid image URLs use the placeholder. */ }
  }

  if (!usableUrl || failedUrl === usableUrl) {
    return (
      <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border bg-muted/30 text-center text-muted-foreground">
        <ImageOff aria-hidden="true" className="h-5 w-5" />
        <span className="text-xs">{url ? 'Image unavailable' : 'No image'}</span>
      </div>
    )
  }

  const thumbnail = (
    <Image src={usableUrl} alt={description || 'Caption image'} width={80} height={80}
      unoptimized loading="lazy" onError={() => setFailedUrl(usableUrl)}
      className="h-20 w-20 rounded-md border bg-muted/20 object-contain" />
  )
  return imageId ? (
    <Link href={`/image/${encodeURIComponent(imageId)}`} aria-label="View caption image details"
      className="inline-block rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {thumbnail}
    </Link>
  ) : thumbnail
}
