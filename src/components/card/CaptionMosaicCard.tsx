"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useTimeZone } from "@/components/TimeZoneContext";
import { CaptionSearchResult } from "@/types/captions";

function formatDateTime(dt: Date | string | null | undefined, timeZone: string) {
  if (!dt) return "—";
  const d = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatProfileName(caption: CaptionSearchResult) {
  const first = caption.profiles?.first_name?.trim();
  const last = caption.profiles?.last_name?.trim();
  const email = caption.profiles?.email?.trim();

  if (first && last) return `${first} ${last}`;
  if (email) return email;

  const partialName = [first, last].filter(Boolean).join(" ");
  return partialName || "Unknown User";
}

function formatHumorFlavorLabel(caption: CaptionSearchResult) {
  const slug = caption.humor_flavors?.slug?.trim();
  if (slug) return slug;
  if (caption.humor_flavor_id != null) return `Flavor ${caption.humor_flavor_id}`;
  return "—";
}

export default function CaptionMosaicCard({
  caption,
}: {
  caption: CaptionSearchResult;
}) {
  const { timeZone } = useTimeZone();
  const router = useRouter();
  const isPublic = caption.is_public === true;
  const imageUrl = caption.images?.url ?? null;
  const profileName = formatProfileName(caption);
  const humorFlavorLabel = formatHumorFlavorLabel(caption);

  const handleOpen = () => {
    if (!caption.id) return;
    router.push(`/caption/${caption.id}`);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={!caption.id}
      className="group mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-border/70 bg-card/90 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-border/70 disabled:hover:shadow-sm"
    >
      <div className="border-b border-border/60 bg-muted/20">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Caption ${caption.id} image`}
            className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.01]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex min-h-48 items-center justify-center px-4 py-16 text-sm text-muted-foreground">
            Image unavailable
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge
            variant="secondary"
            className={
              isPublic
                ? "px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30"
                : "px-2 py-1 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30"
            }
          >
            {isPublic ? "Public" : "Private"}
          </Badge>
        </div>

        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {caption.content || "—"}
        </p>

        <div className="grid gap-1 text-xs text-muted-foreground">
          <p className="uppercase tracking-wide">Humor Flavor</p>
          <p className="text-foreground/90">{humorFlavorLabel}</p>
        </div>

        <div className="grid gap-1 text-xs text-muted-foreground">
          <p className="text-foreground/90">{profileName}</p>
          <p>{formatDateTime(caption.created_datetime_utc, timeZone)}</p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{(caption.like_count ?? 0).toLocaleString()} likes</span>
          <span>{(caption.share_count ?? 0).toLocaleString()} shares</span>
        </div>
      </div>
    </button>
  );
}
