"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaptionDetails } from "@/types/captions";
import { CaptionService } from "@/services/captions.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronDown, Copy, ExternalLink } from "lucide-react";
import { useTimeZone } from "@/components/TimeZoneContext";

interface CaptionDetailsPageProps {
  captionId: string;
}

const formatDateTime = (value: string | null | undefined, timeZone: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
};

const formatProfileName = (caption?: CaptionDetails | null) => {
  const first = caption?.profiles?.first_name?.trim();
  const last = caption?.profiles?.last_name?.trim();
  const name = [first, last].filter(Boolean).join(" ");
  return name || "Unknown User";
};

export default function CaptionDetailsPage({ captionId }: CaptionDetailsPageProps) {
  const router = useRouter();
  const { timeZone } = useTimeZone();
  const [caption, setCaption] = useState<CaptionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [openResponseId, setOpenResponseId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchCaption = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await CaptionService.getCaptionDetails(captionId);
        if (!alive) return;
        if (!result) {
          setCaption(null);
          setLoadError("Caption not found.");
          return;
        }
        setCaption(result);
      } catch (error) {
        if (!alive) return;
        setCaption(null);
        setLoadError("Failed to load caption details.");
      } finally {
        if (alive) {
          setIsLoading(false);
        }
      }
    };

    if (captionId) {
      fetchCaption();
    } else {
      setCaption(null);
      setLoadError("Caption not found.");
      setIsLoading(false);
    }

    return () => {
      alive = false;
    };
  }, [captionId]);

  useEffect(() => {
    setImageError(false);
  }, [caption?.image_id]);

  // Load the caption's free-form metadata blob separately and defensively — it's
  // optional, and its column may not exist yet in every environment.
  useEffect(() => {
    let alive = true;
    if (!captionId) {
      setMetadata(null);
      return;
    }
    CaptionService.getCaptionMetadata(captionId).then((m) => {
      if (alive) setMetadata(m);
    });
    return () => {
      alive = false;
    };
  }, [captionId]);

  const profileName = useMemo(() => formatProfileName(caption), [caption]);
  const imageUrl = caption?.images?.url ?? null;
  const shareCount = caption?.share_count ?? 0;
  const likeCount = caption?.like_count ?? 0;
  const dislikeCount = caption?.dislike_count ?? 0;
  const humorFlavorId = caption?.humor_flavors?.id ?? caption?.humor_flavor_id ?? null;
  const humorFlavorLabel = caption?.humor_flavors?.slug
    ? `${caption.humor_flavors.slug} (${caption.humor_flavors.id})`
    : humorFlavorId ?? "-";
  const matrixBaseUrl = process.env.NEXT_PUBLIC_MATRIX_BASE_URL?.replace(/\/$/, "");
  const humorFlavorUrl =
    matrixBaseUrl && humorFlavorId != null
      ? `${matrixBaseUrl}/humor-flavor/${humorFlavorId}`
      : null;
  const llmResponses = useMemo(() => {
    const responses = caption?.llm_responses ?? [];
    return [...responses].sort((a, b) => {
      const aStep = a.humor_flavor_step_order_by ?? Number.POSITIVE_INFINITY;
      const bStep = b.humor_flavor_step_order_by ?? Number.POSITIVE_INFINITY;
      if (aStep !== bStep) return aStep - bStep;

      const aCreated = Date.parse(a.created_datetime_utc ?? "");
      const bCreated = Date.parse(b.created_datetime_utc ?? "");
      const safeACreated = Number.isNaN(aCreated) ? Number.POSITIVE_INFINITY : aCreated;
      const safeBCreated = Number.isNaN(bCreated) ? Number.POSITIVE_INFINITY : bCreated;
      if (safeACreated !== safeBCreated) return safeACreated - safeBCreated;

      return String(a.id).localeCompare(String(b.id));
    });
  }, [caption?.llm_responses]);

  useEffect(() => {
    if (llmResponses.length === 0) {
      setOpenResponseId(null);
      return;
    }

    setOpenResponseId((current) => {
      if (current && llmResponses.some((response) => response.id === current)) {
        return current;
      }
      return null;
    });
  }, [llmResponses]);

  const handleCopy = () => {
    if (!caption?.content) return;
    navigator.clipboard.writeText(caption.content);
    toast({
      title: "Caption copied",
      description: "Caption text copied to clipboard",
    });
  };

  const statusBadges = useMemo(() => {
    if (!caption) return [];
    return [
      {
        label: caption.is_public ? "Public" : "Private",
        className: caption.is_public
          ? "bg-green-100 text-green-700 dark:bg-green-900/30"
          : "bg-orange-100 text-orange-700 dark:bg-orange-900/30",
      },
      {
        label: caption.is_featured ? "Featured" : "Not Featured",
        className: caption.is_featured
          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30"
          : "bg-muted/60 text-muted-foreground",
      },
    ];
  }, [caption]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="page-title">Caption Details</h1>
            <p className="page-subtitle">Review caption metadata and related image.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="bg-background">
              <Link href="/captions">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Captions
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Loading caption details...</p>
            </div>
          ) : loadError || !caption ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-muted-foreground">{loadError || "Caption not found."}</p>
              <Button variant="outline" size="sm" onClick={() => router.push("/captions")}>
                Return to Captions
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadges.map((badge) => (
                  <Badge key={badge.label} variant="secondary" className={`font-sans ${badge.className}`}>
                    {badge.label}
                  </Badge>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4">
                  <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold">Caption</h2>
                          <p className="text-xs text-muted-foreground break-all">
                            Caption ID: <span className="text-foreground">{caption.id}</span>
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopy}
                          disabled={!caption.content}
                          className="bg-background"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <p className="text-base leading-relaxed whitespace-pre-wrap font-sans">
                        {caption.content || "-"}
                      </p>
                    </CardContent>
                  </Card>

                  {metadata && Object.keys(metadata).length > 0 ? (
                    <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                      <CardContent className="p-4 space-y-2">
                        <h3 className="text-base font-semibold">Metadata</h3>
                        <p className="text-xs text-muted-foreground">
                          Extra fields attached when this caption was created.
                        </p>
                        <pre className="overflow-x-auto rounded bg-background/70 p-3 text-xs font-mono leading-relaxed">
                          {JSON.stringify(metadata, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                    <CardContent className="p-0 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                        <div>
                          <h3 className="text-base font-semibold">Image</h3>
                          <p className="text-xs text-muted-foreground break-all">
                            Image ID: <span className="text-foreground">{caption.image_id}</span>
                          </p>
                        </div>
                        {caption.image_id ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/image/${caption.image_id}`}>
                              Open Image
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                      <div className="bg-black/90 flex items-center justify-center min-h-[260px]">
                        {!imageError && imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={`Caption ${caption.id} image`}
                            className="w-full h-full object-contain"
                            onError={() => setImageError(true)}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full w-full bg-muted/40">
                            <p className="text-sm text-muted-foreground">
                              {imageUrl ? "Failed to load image" : "Image unavailable"}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-base font-semibold">Metadata</h3>
                        <Badge variant="secondary" className="font-sans bg-muted/50 text-muted-foreground">
                          Profile: {profileName}
                        </Badge>
                      </div>
                      <dl className="space-y-3 text-sm">
                        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
                          <dt className="text-muted-foreground font-sans">Profile ID</dt>
                          <dd className="text-foreground font-medium break-all">{caption.profile_id}</dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
                          <dt className="text-muted-foreground font-sans">Created</dt>
                          <dd className="text-foreground font-medium">
                            {formatDateTime(caption.created_datetime_utc, timeZone)}
                          </dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
                          <dt className="text-muted-foreground font-sans">Modified</dt>
                          <dd className="text-foreground font-medium">
                            {formatDateTime(caption.modified_datetime_utc, timeZone)}
                          </dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
                          <dt className="text-muted-foreground font-sans">Caption Request</dt>
                          <dd className="text-foreground font-medium">
                            {caption.caption_request_id ?? "-"}
                          </dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
                          <dt className="text-muted-foreground font-sans">Humor Flavor</dt>
                          <dd className="flex items-center gap-2 text-foreground font-medium">
                            <span>{humorFlavorLabel}</span>
                            {humorFlavorUrl ? (
                              <a
                                href={humorFlavorUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open humor flavor ${humorFlavorId} in Matrix`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : null}
                          </dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
                          <dt className="text-muted-foreground font-sans">Image Url</dt>
                          <dd className="text-foreground font-medium break-all">
                            {imageUrl ? (
                              <a
                                href={imageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                              >
                                {imageUrl}
                              </a>
                            ) : (
                              "-"
                            )}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                    <CardContent className="p-4 space-y-3">
                      <h3 className="text-base font-semibold">Engagement</h3>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-border/60 bg-background p-3">
                          <p className="text-xs text-muted-foreground">Likes</p>
                          <p className="text-2xl font-semibold">{likeCount.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background p-3">
                          <p className="text-xs text-muted-foreground">Dislikes</p>
                          <p className="text-2xl font-semibold">{dislikeCount.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background p-3">
                          <p className="text-xs text-muted-foreground">Shares</p>
                          <p className="text-2xl font-semibold">{shareCount.toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">LLM Responses</h3>
                </div>
                {llmResponses.length > 0 ? (
                  <div className="space-y-3">
                    {llmResponses.map((response) => (
                      <Card
                        key={response.id}
                        className="border border-border/60 bg-muted/20 animate-in fade-in-0"
                      >
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                          onClick={() =>
                            setOpenResponseId((current) =>
                              current === response.id ? null : response.id
                            )
                          }
                          aria-expanded={openResponseId === response.id}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                Step Number: {response.humor_flavor_step_order_by ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Response ID: {response.id}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(response.created_datetime_utc, timeZone)}
                              </p>
                              <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform ${
                                  openResponseId === response.id ? "rotate-180" : ""
                                }`}
                              />
                            </div>
                          </div>
                        </button>
                        {openResponseId === response.id ? (
                          <CardContent className="p-4 pt-2 space-y-3">
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <p>Model: {response.llm_model_name}</p>
                              <p>
                                Flavor:{" "}
                                {response.humor_flavor_slug ??
                                  response.humor_flavor_id ??
                                  "—"}
                              </p>
                              <p>Temp: {response.llm_temperature ?? "—"}</p>
                              <p>
                                Processing:{" "}
                                {response.processing_time_seconds != null
                                  ? `${response.processing_time_seconds}s`
                                  : "—"}
                              </p>
                            </div>
                            <div className="space-y-3">
                              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                                <p className="text-base font-semibold leading-tight mb-2">
                                  System Prompt
                                </p>
                                <p className="text-base text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
                                  {response.llm_system_prompt || "—"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                                <p className="text-base font-semibold leading-tight mb-2">
                                  User Prompt
                                </p>
                                <p className="text-base text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
                                  {response.llm_user_prompt || "—"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                                <p className="text-base font-semibold leading-tight mb-2">
                                  Model Response
                                </p>
                                <pre className="text-base text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
                                  {response.llm_model_response ?? "—"}
                                </pre>
                              </div>
                            </div>
                          </CardContent>
                        ) : null}
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                    No LLM responses recorded for this caption.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
