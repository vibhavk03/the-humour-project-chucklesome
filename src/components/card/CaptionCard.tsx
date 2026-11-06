"use client";

import { useRouter } from "next/navigation";
import { CaptionSearchResult } from "@/types/captions";
import { Badge } from "@/components/ui/badge";
import { useTimeZone } from "@/components/TimeZoneContext";

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
  const name = [first, last].filter(Boolean).join(" ");
  return name || "Unknown User";
}

export default function CaptionCard({
  caption,
}: {
  caption: CaptionSearchResult;
}) {
  const { timeZone } = useTimeZone();
  const router = useRouter();
  const isPublic = caption.is_public === true;
  const profileName = formatProfileName(caption);
  const imageUrl = caption.images?.url ?? null;
  const canOpen = Boolean(caption.id);
  const handleOpen = () => {
    if (!caption.id) return;
    router.push(`/caption/${caption.id}`);
  };

  return (
    <div
      className={`grid grid-cols-12 items-start gap-3 px-4 py-3 transition-colors animate-in fade-in-0 ${
        canOpen ? "cursor-pointer hover:bg-muted/50" : ""
      }`}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : -1}
      aria-disabled={!canOpen}
      onClick={canOpen ? handleOpen : undefined}
      onKeyDown={
        canOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleOpen();
              }
            }
          : undefined
      }
    >
      {/* Id */}
      <div className="col-span-2 min-w-0">
        <div className="text-xs text-muted-foreground break-all font-medium">
          {caption.id || "—"}
        </div>
      </div>

      {/* Image */}
      <div className="col-span-1 flex justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Caption image thumbnail"
            className="h-9 w-9 rounded-md border border-border/60 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-9 w-9 rounded-md border border-dashed border-border/60 bg-muted/30" />
        )}
      </div>

      {/* Caption */}
      <div className="col-span-3 min-w-0">
        <div className="text-sm font-medium text-foreground break-words">
          {caption.content || "—"}
        </div>
      </div>

      {/* User */}
      <div className="col-span-2 text-center min-w-0">
        <div className="text-sm text-foreground truncate" title={profileName}>
          {profileName}
        </div>
      </div>

      {/* Created */}
      <div className="col-span-3 text-center text-sm text-foreground whitespace-nowrap">
        {formatDateTime(caption.created_datetime_utc, timeZone)}
      </div>

      {/* Visibility */}
      <div className="col-span-1 flex justify-center">
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
    </div>
  );
}
