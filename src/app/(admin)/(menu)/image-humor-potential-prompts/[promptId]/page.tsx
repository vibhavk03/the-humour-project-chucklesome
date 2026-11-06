"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ArrowLeft, ExternalLink, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTimeZone } from "@/components/TimeZoneContext";
import { ImageHumorPotentialPromptsService } from "@/services/image-humor-potential-prompts.service";
import { LlmService } from "@/services/llm.service";
import { getAuthTokenAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import ImageHumorPotentialPrompt from "@/types/image-humor-potential-prompt";
import LlmModel from "@/types/llm-model";
import EditImageHumorPotentialPromptDialog from "@/components/dialog/EditImageHumorPotentialPromptDialog";

const JPEGASUS_RESULTS_URL = "https://imagescores.almostcrackd.ai";

function parsePromptId(value: unknown): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" && value[0].length > 0 ? value[0] : null;
  }
  return typeof value === "string" && value.length > 0 ? value : null;
}

type ScoredImage = {
  imageId: string;
  imageUrl?: string | null;
  score: number;
  reasoning?: string | null;
  primarySignal?: string | null;
};

type RunResult = {
  uploadedImages: ScoredImage[];
  errors: unknown[];
};

function getScoreBadgeClassName(score: number) {
  if (score >= 0.7) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  }
  if (score >= 0.4) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  }
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

function truncateReasoning(text: string | null | undefined, maxLength = 140) {
  if (!text) return null;
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length === 0) return null;
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine;
}

export default function ImageHumorPotentialPromptDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const { toast } = useToast();
  const { timeZone } = useTimeZone();

  const promptId = useMemo(() => {
    const fromParams = parsePromptId(params?.promptId);
    if (fromParams) return fromParams;
    if (!pathname) return null;
    const match = pathname.match(/\/image-humor-potential-prompts\/([^/]+)/);
    return match ? match[1] : null;
  }, [params, pathname]);

  const [prompt, setPrompt] = useState<ImageHumorPotentialPrompt | null>(null);
  const [model, setModel] = useState<LlmModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const loadPrompt = async () => {
    if (!promptId) return;
    setIsLoading(true);
    try {
      const [promptData, models] = await Promise.all([
        ImageHumorPotentialPromptsService.getById(promptId),
        LlmService.getAllModels(),
      ]);
      setPrompt(promptData);
      setModel(promptData ? models.find((m) => m.id === promptData.llm_model_id) ?? null : null);
    } catch (error) {
      console.error("Failed to load prompt:", error);
      toast({
        title: "Error",
        description: "Failed to load prompt",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId]);

  const runPrompt = async () => {
    if (!prompt) return;

    setIsRunning(true);
    setRunError(null);

    try {
      let token: string | undefined;
      try {
        const auth = await getAuthTokenAction();
        token = auth?.access_token;
      } catch (error) {
        console.error("Error fetching auth token:", error);
      }

      if (!token) {
        throw new Error("Authentication required. Please sign in and try again.");
      }

      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";
      const response = await fetch(`${baseUrl}/pipeline/select-db-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ promptId: prompt.id }),
      });

      const rawText = await response.text();
      if (!response.ok) {
        let message = rawText || response.statusText;
        try {
          const parsed = JSON.parse(rawText);
          message = parsed?.message || parsed?.statusMessage || parsed?.error || message;
        } catch {
          // Keep raw text as message when parsing fails.
        }
        throw new Error(message || "Failed to run prompt.");
      }

      let parsed: unknown = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error("Unexpected response from select-db-images endpoint.");
      }

      const result = parsed as RunResult;
      if (!result || !Array.isArray(result.uploadedImages)) {
        throw new Error("Unexpected response from select-db-images endpoint.");
      }

      setRunResult(result);
      toast({
        title: "Scoring complete",
        description: `Scored ${result.uploadedImages.length} images.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run prompt.";
      console.error("Error running prompt:", error);
      setRunError(message);
      toast({
        title: "Run failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const averageScore = useMemo(() => {
    if (!runResult || runResult.uploadedImages.length === 0) return null;
    const total = runResult.uploadedImages.reduce((sum, image) => sum + (image.score ?? 0), 0);
    return total / runResult.uploadedImages.length;
  }, [runResult]);

  const formatDate = (value: string) => {
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

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="page-card py-16 text-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading prompt...</p>
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="page-shell">
        <Link
          href="/image-humor-potential-prompts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to prompts
        </Link>
        <Card className="p-6">
          <CardContent className="p-0">
            <p className="text-sm text-muted-foreground">Prompt not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <Link
            href="/image-humor-potential-prompts"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to prompts
          </Link>
          <h1 className="page-title">{prompt.name}</h1>
          {prompt.description ? (
            <p className="page-subtitle">{prompt.description}</p>
          ) : null}
          {!prompt.is_active ? (
            <Badge variant="destructive" className="font-sans w-fit">
              Inactive
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsEditOpen(true)}>
            Edit
          </Button>
          <Button onClick={() => void runPrompt()} disabled={isRunning}>
            {isRunning ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Scoring 25 images from the database...
              </span>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run this prompt
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {model?.name ?? `Model ${prompt.llm_model_id}`}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Temperature
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {prompt.llm_temperature}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatDate(prompt.created_datetime_utc)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              System prompt
            </p>
            <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-4 font-mono text-xs text-foreground">
              {prompt.system_prompt}
            </pre>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">User prompt</p>
            <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-4 font-mono text-xs text-foreground">
              {prompt.user_prompt}
            </pre>
          </div>
        </CardContent>
      </Card>

      {runError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {runError}
        </div>
      ) : null}

      {runResult ? (
        <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Run results</h2>
                <p className="text-sm text-muted-foreground">
                  Scored {runResult.uploadedImages.length} images. Average score:{" "}
                  {averageScore !== null ? averageScore.toFixed(2) : "-"}. Errors:{" "}
                  {runResult.errors.length}.
                </p>
              </div>
              <Button variant="outline" asChild>
                <a href={JPEGASUS_RESULTS_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View full results in jpegasus
                </a>
              </Button>
            </div>

            <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
              {runResult.uploadedImages.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                  No images were scored on this run.
                </div>
              ) : (
                runResult.uploadedImages.map((image, index) => {
                  const reasoning = truncateReasoning(image.reasoning);
                  return (
                    <div
                      key={image.imageId || index}
                      className="relative flex flex-wrap items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 pr-24 shadow-sm animate-in fade-in-0"
                    >
                      <div className="flex items-start gap-3">
                        {image.imageUrl ? (
                          <img
                            src={image.imageUrl}
                            alt={`Scored image ${index + 1}`}
                            className="h-12 w-12 rounded-lg border border-border/60 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border/60 bg-muted text-xs font-semibold text-muted-foreground">
                            {index + 1}
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground break-all">
                            {image.imageId}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {image.primarySignal ? (
                              <Badge variant="outline" className="font-sans">
                                {image.primarySignal}
                              </Badge>
                            ) : null}
                          </div>
                          {reasoning ? (
                            <p className="text-xs text-muted-foreground">{reasoning}</p>
                          ) : null}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "absolute right-3 top-3 font-sans",
                          getScoreBadgeClassName(image.score)
                        )}
                      >
                        {image.score.toFixed(2)}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <EditImageHumorPotentialPromptDialog
        prompt={isEditOpen ? prompt : null}
        onOpenChange={() => setIsEditOpen(false)}
        onSuccess={loadPrompt}
      />
    </div>
  );
}
