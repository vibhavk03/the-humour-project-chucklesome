"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CaptionRequestsService } from "@/services/caption-requests.service";
import type { CaptionRequestDetails } from "@/types/caption-request";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTimeZone } from "@/components/TimeZoneContext";

type CaptionRequestDetailsPageProps = {
  captionRequestId: number;
};

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

const formatProfileName = (request?: CaptionRequestDetails | null) => {
  const first = request?.profiles?.first_name?.trim();
  const last = request?.profiles?.last_name?.trim();
  const name = [first, last].filter(Boolean).join(" ");
  return name || "Unknown User";
};

export default function CaptionRequestDetailsPage({
  captionRequestId,
}: CaptionRequestDetailsPageProps) {
  const router = useRouter();
  const { timeZone } = useTimeZone();
  const [request, setRequest] = useState<CaptionRequestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let alive = true;
    const fetchRequest = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        if (!Number.isFinite(captionRequestId)) {
          setRequest(null);
          setLoadError("Invalid caption request.");
          return;
        }
        const result = await CaptionRequestsService.getCaptionRequestDetails(
          captionRequestId
        );
        if (!alive) return;
        if (!result) {
          setRequest(null);
          setLoadError("Caption request not found.");
          return;
        }
        setRequest(result);
      } catch (error) {
        if (!alive) return;
        setRequest(null);
        setLoadError("Failed to load caption request.");
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    fetchRequest();
    return () => {
      alive = false;
    };
  }, [captionRequestId]);

  useEffect(() => {
    setImageError(false);
  }, [request?.image_id]);

  const profileName = useMemo(() => formatProfileName(request), [request]);
  const imageUrl = request?.images?.url ?? null;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="page-title">Caption Request</h1>
            <p className="page-subtitle">Review request metadata and responses.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="bg-background">
              <Link href="/caption-requests">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Requests
              </Link>
            </Button>
            {request?.image_id && (
              <Button variant="outline" size="sm" asChild className="bg-background">
                <Link href={`/image/${request.image_id}`}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View Image
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Loading caption request...</p>
            </div>
          ) : loadError || !request ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-muted-foreground">
                {loadError || "Caption request not found."}
              </p>
              <Button variant="outline" size="sm" onClick={() => router.push("/caption-requests")}>
                Return to Requests
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-sans">
                  Request ID: {request.id}
                </Badge>
                <Badge variant="secondary" className="font-sans bg-muted/50 text-muted-foreground">
                  Created {formatDateTime(request.created_datetime_utc, timeZone)}
                </Badge>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4">
                  <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <h2 className="text-lg font-semibold">Request Details</h2>
                        <p className="text-xs text-muted-foreground break-all">
                          Caption Request ID:{" "}
                          <span className="text-foreground">{request.id}</span>
                        </p>
                      </div>
                      <dl className="space-y-2 text-sm">
                        <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                          <dt className="text-muted-foreground font-sans">Profile ID</dt>
                          <dd className="text-foreground font-medium break-all">
                            {request.profile_id}
                          </dd>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                          <dt className="text-muted-foreground font-sans">User</dt>
                          <dd className="text-foreground font-medium">
                            {profileName}
                          </dd>
                        </div>
                        {request.profiles?.email ? (
                          <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                            <dt className="text-muted-foreground font-sans">Email</dt>
                            <dd className="text-foreground font-medium break-all">
                              {request.profiles.email}
                            </dd>
                          </div>
                        ) : null}
                        <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                          <dt className="text-muted-foreground font-sans">Image ID</dt>
                          <dd className="text-foreground font-medium break-all">
                            {request.image_id}
                          </dd>
                        </div>
                        {request.images?.image_description ? (
                          <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                            <dt className="text-muted-foreground font-sans">Image Notes</dt>
                            <dd className="text-foreground font-medium">
                              {request.images.image_description}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </CardContent>
                  </Card>

                  <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                    <CardContent className="p-0 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                        <div>
                          <h3 className="text-base font-semibold">Image</h3>
                          <p className="text-xs text-muted-foreground break-all">
                            Image ID: <span className="text-foreground">{request.image_id}</span>
                          </p>
                        </div>
                        {imageUrl ? (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={imageUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Open Image
                            </a>
                          </Button>
                        ) : null}
                      </div>
                      <div className="bg-black/90 flex items-center justify-center min-h-[260px]">
                        {!imageError && imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={`Caption request ${request.id} image`}
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
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">LLM Responses</h3>
                        <Badge variant="secondary" className="font-sans bg-muted/50 text-muted-foreground">
                          {(request.llm_model_responses?.length ?? 0).toLocaleString()} responses
                        </Badge>
                      </div>
                      {request.llm_model_responses && request.llm_model_responses.length > 0 ? (
                        <div className="space-y-4">
                          {request.llm_model_responses.map((resp) => (
                            <Card key={resp.id} className="border border-border/60 bg-background">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold">
                                      {resp.llm_model_name || `Model ${resp.llm_model_id}`}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Response ID: {resp.id}
                                    </p>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateTime(resp.created_datetime_utc, timeZone)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span>Flavor: {resp.humor_flavor_slug ?? resp.humor_flavor_id}</span>
                                  <span>Temp: {resp.llm_temperature ?? "—"}</span>
                                  <span>Processing: {resp.processing_time_seconds}s</span>
                                </div>
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <p className="font-medium">System Prompt</p>
                                    <p className="text-muted-foreground whitespace-pre-wrap">
                                      {resp.llm_system_prompt || "—"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium">User Prompt</p>
                                    <p className="text-muted-foreground whitespace-pre-wrap">
                                      {resp.llm_user_prompt || "—"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium">Model Response</p>
                                    <ScrollArea className="max-h-[200px]">
                                      <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                                        {resp.llm_model_response ?? "—"}
                                      </pre>
                                    </ScrollArea>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                          No LLM responses recorded for this request.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
