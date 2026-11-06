"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { HumorFlavorStepsService } from "@/services/humor-flavor-steps.service";
import type { Database } from "@/types/supabase";
import type HumorFlavorStep from "@/types/humor-flavor-step";
import type { LlmPromptChainRow } from "@/types/llm-prompt-chain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTimeZone } from "@/components/TimeZoneContext";

type CaptionRow = Pick<
  Database["public"]["Tables"]["captions"]["Row"],
  | "id"
  | "created_datetime_utc"
  | "content"
  | "image_id"
  | "profile_id"
  | "is_public"
  | "is_featured"
  | "like_count"
>;

type LlmResponseRow = Pick<
  Database["public"]["Tables"]["llm_model_responses"]["Row"],
  | "id"
  | "created_datetime_utc"
  | "llm_model_id"
  | "caption_request_id"
  | "profile_id"
  | "humor_flavor_id"
  | "humor_flavor_step_id"
  | "processing_time_seconds"
  | "llm_temperature"
  | "llm_system_prompt"
  | "llm_user_prompt"
  | "llm_model_response"
>;

type LlmPromptChainSummary = Pick<
  LlmPromptChainRow,
  "id" | "created_datetime_utc" | "caption_request_id"
>;

type LlmPromptChainDetailsPageProps = {
  promptChainId: number;
};

const formatDateTime = (value: string | null | undefined, timeZone: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

const truncateText = (value: string | null | undefined, max = 120) => {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
};

const truncateId = (value: string | null | undefined) => {
  if (!value) return "—";
  if (value.length <= 8) return value;
  return `${value.slice(0, 8)}...`;
};

const resolveStepTypeMeta = (step: HumorFlavorStep) => {
  const embedded = step.humor_flavor_step_types;
  const stepType = Array.isArray(embedded) ? embedded[0] : embedded;
  const label =
    stepType?.slug ||
    stepType?.description ||
    (step.humor_flavor_step_type_id != null
      ? `#${step.humor_flavor_step_type_id}`
      : "—");
  const title =
    stepType?.description ||
    stepType?.slug ||
    (step.humor_flavor_step_type_id != null
      ? `#${step.humor_flavor_step_type_id}`
      : "");
  return { label, title };
};

const resolveModelMeta = (step: HumorFlavorStep) => {
  const modelName = step.llm_models?.name ?? null;
  const modelProviderId = step.llm_models?.provider_model_id ?? null;
  const label =
    modelName ||
    modelProviderId ||
    (step.llm_model_id != null ? String(step.llm_model_id) : "—");
  const title =
    modelProviderId ||
    modelName ||
    (step.llm_model_id != null ? String(step.llm_model_id) : "");
  return { label, title };
};

export default function LlmPromptChainDetailsPage({
  promptChainId,
}: LlmPromptChainDetailsPageProps) {
  const router = useRouter();
  const { timeZone } = useTimeZone();
  const [promptChain, setPromptChain] = useState<LlmPromptChainSummary | null>(
    null
  );
  const [captions, setCaptions] = useState<CaptionRow[]>([]);
  const [responses, setResponses] = useState<LlmResponseRow[]>([]);
  const [steps, setSteps] = useState<HumorFlavorStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<LlmResponseRow | null>(
    null
  );
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    const fetchPromptChainDetails = async () => {
      setIsLoading(true);
      setLoadError(null);

      if (!supabase) {
        setLoadError("Supabase client unavailable.");
        setIsLoading(false);
        return;
      }

      if (!Number.isFinite(promptChainId)) {
        setLoadError("Invalid prompt chain.");
        setIsLoading(false);
        return;
      }

      try {
        const [chainResult, captionsResult, responsesResult] = await Promise.all([
          supabase
            .from("llm_prompt_chains")
            .select("id, created_datetime_utc, caption_request_id")
            .eq("id", promptChainId)
            .single(),
          supabase
            .from("captions")
            .select(
              `
              id,
              created_datetime_utc,
              content,
              image_id,
              profile_id,
              is_public,
              is_featured,
              like_count
            `
            )
            .eq("llm_prompt_chain_id", promptChainId)
            .order("created_datetime_utc", { ascending: false }),
          supabase
            .from("llm_model_responses")
            .select(
              `
              id,
              created_datetime_utc,
              llm_model_id,
              caption_request_id,
              profile_id,
              humor_flavor_id,
              humor_flavor_step_id,
              processing_time_seconds,
              llm_temperature,
              llm_system_prompt,
              llm_user_prompt,
              llm_model_response
            `
            )
            .eq("llm_prompt_chain_id", promptChainId)
            .order("created_datetime_utc", { ascending: false }),
        ]);

        if (!alive) return;

        if (chainResult.error) {
          console.error("Error fetching prompt chain:", chainResult.error);
          setLoadError("Prompt chain not found.");
          setPromptChain(null);
        } else {
          setPromptChain(chainResult.data ?? null);
        }

        if (captionsResult.error) {
          console.error("Error fetching prompt chain captions:", captionsResult.error);
          setCaptions([]);
        } else {
          setCaptions(captionsResult.data ?? []);
        }

        if (responsesResult.error) {
          console.error("Error fetching prompt chain responses:", responsesResult.error);
          setResponses([]);
          setSteps([]);
        } else {
          const responseRows = (responsesResult.data ?? []) as LlmResponseRow[];
          setResponses(responseRows);

          const stepIds = Array.from(
            new Set(
              responseRows
                .map((response) => response.humor_flavor_step_id)
                .filter(
                  (value): value is number =>
                    typeof value === "number" && Number.isFinite(value)
                )
            )
          );

          if (stepIds.length > 0) {
            const stepsData = await HumorFlavorStepsService.getStepsByIds(stepIds);
            if (!alive) return;
            setSteps(stepsData);
          } else {
            setSteps([]);
          }
        }
      } catch (error) {
        if (!alive) return;
        console.error("Error fetching prompt chain details:", error);
        setLoadError("Failed to load prompt chain.");
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    fetchPromptChainDetails();
    return () => {
      alive = false;
    };
  }, [promptChainId]);

  const captionCount = captions.length;
  const responseCount = responses.length;
  const stepCount = steps.length;

  const handleResponseSelect = (response: LlmResponseRow) => {
    setSelectedResponse(response);
    setIsResponseDialogOpen(true);
  };

  const label = "text-sm font-medium text-muted-foreground";

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="page-title">LLM Prompt Chain</h1>
            <p className="page-subtitle">
              Prompt chain details and generated outputs.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="bg-background">
            <Link href="/llm-prompt-chains">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Prompt Chains
            </Link>
          </Button>
        </div>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">
                Loading prompt chain details...
              </p>
            </div>
          ) : loadError || !promptChain ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-muted-foreground">
                {loadError || "Prompt chain not found."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/llm-prompt-chains")}
              >
                Return to Prompt Chains
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-sans">
                  Prompt Chain ID: {promptChain.id}
                </Badge>
                <Badge variant="secondary" className="font-sans bg-muted/50">
                  Caption Request: {promptChain.caption_request_id}
                </Badge>
                <Badge variant="secondary" className="font-sans bg-muted/50">
                  Created {formatDateTime(promptChain.created_datetime_utc, timeZone)}
                </Badge>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold">Prompt Chain Details</h2>
                        <p className="text-xs text-muted-foreground">
                          Chain metadata and source request.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="bg-background"
                      >
                        <Link href={`/caption-request/${promptChain.caption_request_id}`}>
                          View Caption Request
                        </Link>
                      </Button>
                    </div>
                    <dl className="space-y-2 text-sm">
                      <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
                        <dt className="text-muted-foreground font-sans">
                          Prompt Chain ID
                        </dt>
                        <dd className="text-foreground font-medium">
                          {promptChain.id}
                        </dd>
                      </div>
                      <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
                        <dt className="text-muted-foreground font-sans">Created</dt>
                        <dd className="text-foreground font-medium">
                          {formatDateTime(promptChain.created_datetime_utc, timeZone)}
                        </dd>
                      </div>
                      <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
                        <dt className="text-muted-foreground font-sans">
                          Caption Request ID
                        </dt>
                        <dd className="text-foreground font-medium">
                          {promptChain.caption_request_id}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                <Card className="border border-border/60 bg-muted/20 animate-in fade-in-0">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h2 className="text-lg font-semibold">Generated Output</h2>
                      <p className="text-xs text-muted-foreground">
                        Totals for this chain run.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/60 bg-background p-3">
                        <p className="text-xs text-muted-foreground">Captions</p>
                        <p className="text-2xl font-semibold">{captionCount}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background p-3">
                        <p className="text-xs text-muted-foreground">LLM Responses</p>
                        <p className="text-2xl font-semibold">{responseCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border border-border/60 bg-muted/10 animate-in fade-in-0">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                    <div>
                      <h3 className="text-base font-semibold">Humor Flavor Steps</h3>
                      <p className="text-xs text-muted-foreground">
                        {stepCount} steps ran for this prompt chain.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-base table-fixed">
                      <thead className="table-head">
                        <tr>
                          <th className="w-20">Id</th>
                          <th className="w-20">Order</th>
                          <th className="w-36">Step Type</th>
                          <th className="w-36">Model</th>
                          <th className="w-24">Input</th>
                          <th className="w-24">Output</th>
                          <th className="w-24">Temp</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {steps.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center text-muted-foreground">
                              No humor flavor steps found for this prompt chain.
                            </td>
                          </tr>
                        ) : (
                          steps.map((step) => {
                            const stepTypeMeta = resolveStepTypeMeta(step);
                            const modelMeta = resolveModelMeta(step);

                            return (
                              <tr key={step.id}>
                                <td className="font-sans">
                                  <div className="truncate" title={String(step.id)}>
                                    {step.id}
                                  </div>
                                </td>
                                <td>{step.order_by ?? "—"}</td>
                                <td>
                                  <div className="truncate" title={stepTypeMeta.title}>
                                    {stepTypeMeta.label}
                                  </div>
                                </td>
                                <td>
                                  <div className="truncate" title={modelMeta.title}>
                                    {modelMeta.label}
                                  </div>
                                </td>
                                <td>{step.llm_input_type_id ?? "—"}</td>
                                <td>{step.llm_output_type_id ?? "—"}</td>
                                <td>{step.llm_temperature ?? "—"}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/60 bg-muted/10 animate-in fade-in-0">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                    <div>
                      <h3 className="text-base font-semibold">Captions</h3>
                      <p className="text-xs text-muted-foreground">
                        {captionCount} captions generated from this prompt chain.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-base table-fixed">
                      <thead className="table-head">
                        <tr>
                          <th className="w-28">Id</th>
                          <th className="w-40">Created</th>
                          <th className="w-64">Content</th>
                          <th className="w-40">Image</th>
                          <th className="w-40">Profile</th>
                          <th className="w-24">Public</th>
                          <th className="w-24">Featured</th>
                          <th className="w-24">Likes</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {captions.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center text-muted-foreground">
                              No captions found for this prompt chain.
                            </td>
                          </tr>
                        ) : (
                          captions.map((caption) => (
                            <tr
                              key={caption.id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => router.push(`/caption/${caption.id}`)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  router.push(`/caption/${caption.id}`);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`View caption ${caption.id}`}
                            >
                              <td className="font-sans">
                                <div className="truncate" title={caption.id}>
                                  {truncateId(caption.id)}
                                </div>
                              </td>
                              <td>
                                <div
                                  className="truncate"
                                  title={formatDateTime(caption.created_datetime_utc, timeZone)}
                                >
                                  {formatDateTime(caption.created_datetime_utc, timeZone)}
                                </div>
                              </td>
                              <td>
                                <div
                                  className="truncate"
                                  title={caption.content ?? "—"}
                                >
                                  {truncateText(caption.content, 140)}
                                </div>
                              </td>
                              <td>
                                <div className="truncate" title={caption.image_id ?? "—"}>
                                  {truncateId(caption.image_id)}
                                </div>
                              </td>
                              <td>
                                <div className="truncate" title={caption.profile_id ?? "—"}>
                                  {truncateId(caption.profile_id)}
                                </div>
                              </td>
                              <td>{caption.is_public ? "Yes" : "No"}</td>
                              <td>{caption.is_featured ? "Yes" : "No"}</td>
                              <td>{caption.like_count ?? 0}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/60 bg-muted/10 animate-in fade-in-0">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                    <div>
                      <h3 className="text-base font-semibold">LLM Responses</h3>
                      <p className="text-xs text-muted-foreground">
                        {responseCount} model responses tied to this chain.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-base table-fixed">
                      <thead className="table-head">
                        <tr>
                          <th className="w-28">Id</th>
                          <th className="w-40">Created</th>
                          <th className="w-24">Model</th>
                          <th className="w-28">Caption Req</th>
                          <th className="w-28">Profile</th>
                          <th className="w-24">Flavor</th>
                          <th className="w-24">Temp</th>
                          <th className="w-28">Processing</th>
                          <th className="w-64">Response</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {responses.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="text-center text-muted-foreground">
                              No LLM responses found for this prompt chain.
                            </td>
                          </tr>
                        ) : (
                          responses.map((response) => (
                            <tr
                              key={response.id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => handleResponseSelect(response)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleResponseSelect(response);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`View response ${response.id}`}
                            >
                              <td className="font-sans">
                                <div className="truncate" title={response.id}>
                                  {truncateId(response.id)}
                                </div>
                              </td>
                              <td>
                                <div
                                  className="truncate"
                                  title={formatDateTime(response.created_datetime_utc, timeZone)}
                                >
                                  {formatDateTime(response.created_datetime_utc, timeZone)}
                                </div>
                              </td>
                              <td>
                                <div className="truncate" title={String(response.llm_model_id)}>
                                  {response.llm_model_id}
                                </div>
                              </td>
                              <td>
                                <div
                                  className="truncate"
                                  title={String(response.caption_request_id)}
                                >
                                  {response.caption_request_id}
                                </div>
                              </td>
                              <td>
                                <div className="truncate" title={response.profile_id ?? "—"}>
                                  {truncateId(response.profile_id)}
                                </div>
                              </td>
                              <td>
                                <div
                                  className="truncate"
                                  title={String(response.humor_flavor_id ?? "—")}
                                >
                                  {response.humor_flavor_id ?? "—"}
                                </div>
                              </td>
                              <td>{response.llm_temperature ?? "—"}</td>
                              <td>
                                {response.processing_time_seconds ?? "—"}
                                {response.processing_time_seconds != null ? "s" : ""}
                              </td>
                              <td>
                                <div
                                  className="truncate"
                                  title={response.llm_model_response ?? "—"}
                                >
                                  {truncateText(response.llm_model_response, 140)}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>LLM Response Details</DialogTitle>
          </DialogHeader>
          {selectedResponse ? (
            <div className="space-y-4">
              <div>
                <label className={label}>ID:</label>
                <p className="text-sm font-sans">{selectedResponse.id}</p>
              </div>
              <div>
                <label className={label}>Created:</label>
                <p className="text-sm">
                  {formatDateTime(selectedResponse.created_datetime_utc, timeZone)}
                </p>
              </div>
              <div>
                <label className={label}>Model ID:</label>
                <p className="text-sm">{selectedResponse.llm_model_id}</p>
              </div>
              <div>
                <label className={label}>Caption Request ID:</label>
                <p className="text-sm">{selectedResponse.caption_request_id}</p>
              </div>
              <div>
                <label className={label}>Profile ID:</label>
                <p className="text-sm font-sans">{selectedResponse.profile_id}</p>
              </div>
              <div>
                <label className={label}>Humor Flavor ID:</label>
                <p className="text-sm">{selectedResponse.humor_flavor_id ?? "—"}</p>
              </div>
              <div>
                <label className={label}>Processing Time (s):</label>
                <p className="text-sm">
                  {selectedResponse.processing_time_seconds ?? "—"}
                </p>
              </div>
              <div>
                <label className={label}>Temperature:</label>
                <p className="text-sm">{selectedResponse.llm_temperature ?? "—"}</p>
              </div>
              <div>
                <label className={label}>System Prompt:</label>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedResponse.llm_system_prompt}
                </p>
              </div>
              <div>
                <label className={label}>User Prompt:</label>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedResponse.llm_user_prompt}
                </p>
              </div>
              <div>
                <label className={label}>Response:</label>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedResponse.llm_model_response ?? "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Loading response details...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
