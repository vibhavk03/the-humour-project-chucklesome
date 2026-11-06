"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Captions } from "@/types/captions";
import type { HumorFlavor } from "@/types/humor-flavor";
import type { Study, StudyImageSet } from "@/types/study";
import {
  StudiesService,
  StudyImageSetImageMappingsService,
  StudyImageSetsService,
} from "@/services/studies.service";
import { HumorFlavorsService } from "@/services/humor-flavors.service";
import { getAuthTokenAction } from "@/app/actions";
import { loadCaptionJobResults } from "@/services/caption-job-results.service";
import { isJobId, isTerminal } from "@/utils/caption-jobs";
import {
  CaptionJobRequestError,
  imageGenerationProgress,
  parsePendingStudyCaptionJob,
  runStudyCaptionJob,
  type GenerationStatus,
  type PendingStudyCaptionJob,
  type StudyCaptionJob,
  type StudyCaptionRequest,
} from "@/utils/study-caption-job";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RotateCcw, Sparkles } from "lucide-react";
import { useTimeZone } from "@/components/TimeZoneContext";

type GenerationItem = {
  id: string;
  url?: string | null;
  description?: string | null;
  status: GenerationStatus;
  message?: string | null;
};

const CAPTION_API_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai").replace(/\/+$/, "");
const pendingStorageKey = (userId: string) => `study-generate-captions-job-v1:${CAPTION_API_URL}:${userId}`;

const getStudyLabel = (study: Study) =>
  study.slug?.trim() ? study.slug : `Study ${study.id}`;
const getImageSetLabel = (imageSet: StudyImageSet) =>
  imageSet.slug?.trim() ? imageSet.slug : `Image Set ${imageSet.id}`;

export default function GenerateCaptionsPage() {
  const { toast } = useToast();
  const { timeZone } = useTimeZone();
  const [studies, setStudies] = useState<Study[]>([]);
  const [imageSets, setImageSets] = useState<StudyImageSet[]>([]);
  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingJob, setPendingJob] = useState<PendingStudyCaptionJob | null>(null);
  const pendingJobRef = useRef<PendingStudyCaptionJob | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const [jobProgress, setJobProgress] = useState<StudyCaptionJob | null>(null);
  const generationBlocked = isLoading || isGenerating || pendingJob !== null;

  useEffect(() => () => generationControllerRef.current?.abort(), []);
  const [selectedStudyId, setSelectedStudyId] = useState("");
  const [selectedImageSetId, setSelectedImageSetId] = useState("");
  const [selectedFlavorId, setSelectedFlavorId] = useState("mix");
  const [imageId, setImageId] = useState("");
  const [generatedCaptions, setGeneratedCaptions] = useState<Captions[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [generationItems, setGenerationItems] = useState<GenerationItem[]>([]);
  const [lastRequest, setLastRequest] = useState<{
    studyId: number;
    imageId?: string | null;
    imageSetId?: number | null;
    imageCount: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const loadOptions = async () => {
      setIsLoading(true);
      try {
        const [studiesData, flavorsData, imageSetsData, auth] = await Promise.all([
          StudiesService.getAllStudies(),
          HumorFlavorsService.getAll().catch((error) => {
            console.error("Error loading humor flavors:", error);
            toast({
              title: "Failed to load humor flavors",
              description: "Please refresh the page and try again.",
              variant: "destructive",
            });
            return [];
          }),
          StudyImageSetsService.getAllImageSets(),
          getAuthTokenAction(),
        ]);
        if (!alive) return;
        setStudies(studiesData);
        setFlavors(flavorsData);
        setImageSets(imageSetsData);
        try {
          const saved = parsePendingStudyCaptionJob(JSON.parse(window.localStorage.getItem(pendingStorageKey(auth.user.id)) ?? "null"));
          if (saved && saved.userId === auth.user.id && saved.apiUrl === CAPTION_API_URL) {
            pendingJobRef.current = saved;
            setPendingJob(saved);
            setSelectedStudyId(String(saved.request.studyId));
            setImageId(saved.request.imageId ?? "");
            setSelectedImageSetId(saved.request.studyImageSetId ? String(saved.request.studyImageSetId) : "");
            const flavor = flavorsData.find((item) => item.slug === saved.request.humorFlavorSlug);
            setSelectedFlavorId(flavor ? String(flavor.id) : "mix");
            setGenerationItems(saved.imageIds.map((id) => ({ id, status: "queued" })));
          }
        } catch {
          // Storage is optional; the in-memory reference still supports retries.
        }
      } catch (error) {
        if (!alive) return;
        console.error("Error loading generate captions options:", error);
        toast({
          title: "Failed to load data",
          description: "Please refresh the page and try again.",
          variant: "destructive",
        });
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    void loadOptions();
    return () => {
      alive = false;
    };
  }, [toast]);

  const sortedStudies = useMemo(
    () => [...studies].sort((a, b) => getStudyLabel(a).localeCompare(getStudyLabel(b))),
    [studies]
  );
  const sortedFlavors = useMemo(
    () => [...flavors].sort((a, b) => a.slug.localeCompare(b.slug)),
    [flavors]
  );
  const sortedImageSets = useMemo(
    () =>
      [...imageSets].sort((a, b) => getImageSetLabel(a).localeCompare(getImageSetLabel(b))),
    [imageSets]
  );
  const flavorById = useMemo(
    () => new Map(sortedFlavors.map((flavor) => [flavor.id, flavor])),
    [sortedFlavors]
  );
  const studyById = useMemo(
    () => new Map(sortedStudies.map((study) => [study.id, study])),
    [sortedStudies]
  );
  const imageSetById = useMemo(
    () => new Map(sortedImageSets.map((set) => [set.id, set])),
    [sortedImageSets]
  );

  const trimmedImageId = imageId.trim();
  const canGenerate = Boolean(
    selectedStudyId && (trimmedImageId || selectedImageSetId)
  );

  const handleClear = () => {
    if (generationBlocked) return;
    setSelectedStudyId("");
    setSelectedImageSetId("");
    setSelectedFlavorId("mix");
    setImageId("");
    setErrorMessage(null);
    setStatusModalOpen(false);
    setGenerationItems([]);
    setJobProgress(null);
  };

  const persistPendingJob = (pending: PendingStudyCaptionJob | null) => {
    const previous = pendingJobRef.current;
    pendingJobRef.current = pending;
    setPendingJob(pending);
    try {
      if (pending) window.localStorage.setItem(pendingStorageKey(pending.userId), JSON.stringify(pending));
      else if (previous) window.localStorage.removeItem(pendingStorageKey(previous.userId));
    } catch {
      // Storage is optional; the in-memory reference still supports retries.
    }
  };

  const handleGenerate = async () => {
    if (generationControllerRef.current || isLoading) return;
    let pending = pendingJobRef.current;
    if (!pending && !canGenerate) {
      toast({ title: "Missing required fields", description: "Select a study and provide an image ID or image set to continue.", variant: "destructive" });
      return;
    }
    const controller = new AbortController();
    generationControllerRef.current = controller;
    const { signal } = controller;
    setIsGenerating(true);
    setErrorMessage(null);
    setJobProgress(null);
    if (!pending) {
      setGeneratedCaptions([]);
      setGenerationItems([]);
      setLastRequest(null);
    }

    try {
      if (!pending) {
        const studyId = Number(selectedStudyId);
        if (!Number.isInteger(studyId) || studyId <= 0) throw new Error("Please choose a valid study.");
        const flavor = selectedFlavorId === "mix" ? null : flavorById.get(Number(selectedFlavorId));
        if (selectedFlavorId !== "mix" && !flavor) throw new Error("Please choose a valid humor flavor.");
        const imageSetId = selectedImageSetId ? Number(selectedImageSetId) : null;
        let request: StudyCaptionRequest;
        let items: GenerationItem[];
        const flavorFields = flavor ? { humorFlavorSlug: flavor.slug } : {};
        if (imageSetId !== null) {
          if (!Number.isInteger(imageSetId) || imageSetId <= 0) throw new Error("Please choose a valid image set.");
          const mappings = await StudyImageSetImageMappingsService.getMappingsByImageSetId(imageSetId);
          signal.throwIfAborted();
          const byId = new Map<string, GenerationItem>();
          for (const mapping of mappings) {
            const id = mapping.image_id ?? mapping.images?.id;
            if (id) byId.set(id, { id, url: mapping.images?.url, description: mapping.images?.image_description, status: "queued" });
          }
          items = [...byId.values()];
          if (!items.length) throw new Error("Selected image set has no images to process.");
          request = { studyId, studyImageSetId: imageSetId, ...flavorFields };
        } else {
          if (!isJobId(trimmedImageId)) throw new Error("Please enter a valid image UUID.");
          request = { studyId, imageId: trimmedImageId, ...flavorFields };
          items = [{ id: trimmedImageId, status: "queued" }];
        }
        const auth = await getAuthTokenAction();
        signal.throwIfAborted();
        pending = { apiUrl: CAPTION_API_URL, userId: auth.user.id, idempotencyKey: crypto.randomUUID(), request, imageIds: items.map((item) => item.id) };
        // Persist before submission so an uncertain response can reuse the same key.
        persistPendingJob(pending);
        setGenerationItems(items);
      }
      const request = pending.request;
      setLastRequest({ studyId: request.studyId, imageId: request.imageId, imageSetId: request.studyImageSetId, imageCount: pending.imageIds.length });
      setStatusModalOpen(true);
      const captions = new Map<string, Captions>();
      const result = await runStudyCaptionJob(pending, {
        apiUrl: CAPTION_API_URL,
        getAuth: getAuthTokenAction,
        signal,
        onAccepted: persistPendingJob,
        onProgress: async (job) => {
          signal.throwIfAborted();
          setJobProgress(job);
          setGenerationItems((items) => {
            const byId = new Map(items.map((item) => [item.id, item]));
            return job.imageIds.map((id) => ({ ...byId.get(id), id, ...imageGenerationProgress(job, id) }));
          });
          setLastRequest({ studyId: request.studyId, imageId: request.imageId, imageSetId: request.studyImageSetId, imageCount: job.imageIds.length });
          const newIds = job.captionIds.filter((id) => !captions.has(id));
          if (newIds.length) {
            const saved = await loadCaptionJobResults(newIds, signal);
            signal.throwIfAborted();
            for (const caption of saved) captions.set(caption.id, caption);
            setGeneratedCaptions([...new Set(job.captionIds)].map((id) => captions.get(id)!));
          }
        },
      });
      signal.throwIfAborted();
      persistPendingJob(null);
      if (result.status === "failed" || result.status === "partially_completed") {
        const message = `${result.progress.failed} of ${result.progress.total} image/flavor tasks failed. Check generation status for details.`;
        setErrorMessage(message);
        toast({ title: result.status === "failed" ? "Caption generation failed" : "Some captions failed", description: message, variant: "destructive" });
      } else {
        toast({ title: "Captions generated", description: `Generated ${captions.size} captions across ${result.imageIds.length} images.` });
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof CaptionJobRequestError && (error.status === 404
        || (!pendingJobRef.current?.jobId && error.status >= 400 && error.status < 500 && ![401, 429].includes(error.status)))) {
        persistPendingJob(null);
      }
      const message = error instanceof Error ? error.message : "Failed to generate captions.";
      setErrorMessage(message);
      if (!pendingJobRef.current) {
        setGenerationItems((items) => items.map((item) => ({ ...item, status: "error", message })));
      }
      toast({ title: pendingJobRef.current ? "Caption progress paused" : "Generation failed", description: message, variant: "destructive" });
    } finally {
      if (!signal.aborted) setIsGenerating(false);
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
    }
  };

  const resolveFlavorLabel = (id?: number | null) => {
    if (id == null) return "-";
    const flavor = flavorById.get(id);
    return flavor?.slug || `Flavor ${id}`;
  };

  const lastStudyLabel = lastRequest
    ? (() => {
        const study = studyById.get(lastRequest.studyId);
        return study ? getStudyLabel(study) : `Study ${lastRequest.studyId}`;
      })()
    : null;
  const lastImageSetLabel =
    lastRequest?.imageSetId != null
      ? (() => {
          const imageSet = imageSetById.get(lastRequest.imageSetId);
          const label = imageSet
            ? getImageSetLabel(imageSet)
            : `Image Set ${lastRequest.imageSetId}`;
          return `${label} (${lastRequest.imageCount} images)`;
        })()
      : null;

  const statusCounts = useMemo(() => {
    return generationItems.reduce(
      (acc, item) => {
        acc[item.status] += 1;
        return acc;
      },
      { queued: 0, generating: 0, success: 0, error: 0 }
    );
  }, [generationItems]);
  const totalStatusCount = generationItems.length;
  const completedStatusCount = statusCounts.success + statusCounts.error;
  const progressPercent =
    jobProgress && isTerminal(jobProgress.status) ? 100
      : jobProgress && jobProgress.progress.totalSteps > 0
        ? Math.round((jobProgress.progress.completedSteps / jobProgress.progress.totalSteps) * 100)
        : totalStatusCount > 0 ? Math.round((completedStatusCount / totalStatusCount) * 100) : 0;
  const statusBadgeStyles: Record<
    GenerationStatus,
    { label: string; className: string }
  > = {
    queued: {
      label: "Queued",
      className: "border-border/60 bg-muted/40 text-muted-foreground",
    },
    generating: {
      label: "Generating",
      className: "border-primary/30 bg-primary/10 text-primary",
    },
    success: {
      label: "Done",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    },
    error: {
      label: "Failed",
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Generate Captions</h1>
        <p className="page-subtitle">
          Generate captions for a study and image or image set with background caption generation.
        </p>
      </div>

      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Caption generation status</DialogTitle>
            <DialogDescription>
              Track caption generation progress for each selected image. Jobs continue if you close this dialog or leave the page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Progress
                </p>
                <p className="text-sm text-muted-foreground">
                  {totalStatusCount > 0
                    ? `${completedStatusCount} of ${totalStatusCount} complete`
                    : "No images queued yet."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {totalStatusCount > 0 && (
                  <Badge variant="secondary" className="font-sans">
                    {completedStatusCount}/{totalStatusCount} complete
                  </Badge>
                )}
                {statusCounts.generating > 0 && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-sans",
                      statusBadgeStyles.generating.className
                    )}
                  >
                    {statusCounts.generating} running
                  </Badge>
                )}
                {statusCounts.error > 0 && (
                  <Badge variant="destructive" className="font-sans">
                    {statusCounts.error} failed
                  </Badge>
                )}
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
              {generationItems.length > 0 ? (
                generationItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="relative flex flex-wrap items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 pr-24 shadow-sm animate-in fade-in-0"
                  >
                    <div className="flex items-center gap-3">
                      {item.url ? (
                        <img
                          src={item.url}
                          alt={`Image ${index + 1}`}
                          className="h-12 w-12 rounded-lg border border-border/60 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border/60 bg-muted text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Image {index + 1}
                        </p>
                        <p className="text-xs text-muted-foreground break-all">
                          {item.id}
                        </p>
                        {item.description ? (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {item.description}
                          </p>
                        ) : null}
                        {item.message ? (
                          <p className={cn("text-xs", item.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                            {item.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "absolute right-3 top-3 font-sans",
                        statusBadgeStyles[item.status].className
                      )}
                    >
                      {item.status === "generating" && (
                        <span className="mr-2 inline-flex h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      )}
                      {statusBadgeStyles[item.status].label}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                  Start a generation run to see per-image status updates.
                </div>
              )}
            </div>
          </div>
          {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
          {(jobProgress?.jobId || pendingJob?.jobId) ? (
            <a className="text-sm text-primary underline underline-offset-2" href={`/caption-job/${jobProgress?.jobId || pendingJob?.jobId}`} target="_blank" rel="noopener noreferrer">View caption job details</a>
          ) : null}
          <DialogFooter className="sm:justify-between sm:items-center">
            <span className="text-xs text-muted-foreground">
              {isGenerating ? "Checking caption job" : pendingJob ? "Resume to check caption job" : "Generation finished"}
            </span>
            <Button variant="outline" onClick={() => setStatusModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-foreground">
              New Caption Run
            </div>
            <p className="text-sm text-muted-foreground">
              Study and either an image ID or image set are required. Humor flavor is
              optional.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Study <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedStudyId}
                onValueChange={setSelectedStudyId}
                disabled={generationBlocked || sortedStudies.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoading
                        ? "Loading studies..."
                        : sortedStudies.length === 0
                          ? "No studies available"
                          : "Select study"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sortedStudies.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No studies available
                    </SelectItem>
                  ) : (
                    sortedStudies.map((study) => (
                      <SelectItem key={study.id} value={study.id.toString()}>
                        {getStudyLabel(study)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Image ID
              </Label>
              <Input
                placeholder="Paste image UUID"
                value={imageId}
                onChange={(event) => {
                  setImageId(event.target.value);
                  if (event.target.value.trim()) setSelectedImageSetId("");
                }}
                disabled={generationBlocked}
              />
              <p className="text-xs text-muted-foreground">
                Use this for a single image run.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Image set</Label>
              <Select
                value={selectedImageSetId}
                onValueChange={(value) => { setSelectedImageSetId(value); setImageId(""); }}
                disabled={generationBlocked || sortedImageSets.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoading
                        ? "Loading image sets..."
                        : sortedImageSets.length === 0
                          ? "No image sets available"
                          : "Select image set"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sortedImageSets.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No image sets available
                    </SelectItem>
                  ) : (
                    sortedImageSets.map((imageSet) => (
                      <SelectItem
                        key={imageSet.id}
                        value={imageSet.id.toString()}
                      >
                        {getImageSetLabel(imageSet)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecting a set generates captions for every image in it.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Humor flavor (optional)</Label>
              <Select value={selectedFlavorId} onValueChange={setSelectedFlavorId} disabled={generationBlocked}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto mix" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mix">Current Humor Mix</SelectItem>
                  {sortedFlavors.map((flavor) => (
                    <SelectItem key={flavor.id} value={flavor.id.toString()}>
                      {flavor.slug || `Flavor ${flavor.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {pendingJob && !isGenerating ? (
            <p className="text-sm text-muted-foreground">Resume generation to check the existing job and load its saved captions.</p>
          ) : null}
          {errorMessage && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleGenerate} disabled={isLoading || isGenerating || (!pendingJob && !canGenerate)}>
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {pendingJob ? "Resume generation" : "Generate captions"}
                </>
              )}
            </Button>
            {generationItems.length > 0 || pendingJob ? (
              <Button variant="outline" onClick={() => setStatusModalOpen(true)}>View generation status</Button>
            ) : null}
            <Button variant="ghost" onClick={handleClear} disabled={generationBlocked}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-3">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Generated Captions
              </h2>
              <p className="text-sm text-muted-foreground">
                {lastRequest
                  ? lastRequest.imageSetId != null
                    ? `Last run: ${lastStudyLabel} on image set ${lastImageSetLabel}.`
                    : `Last run: ${lastStudyLabel} on image ${lastRequest.imageId}.`
                  : "Generated captions will appear here after a run."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isGenerating && (
                <Badge variant="secondary" className="font-sans">
                  Generating...
                </Badge>
              )}
              <Badge variant="outline" className="font-sans">
                {generatedCaptions.length} captions
              </Badge>
            </div>
          </div>
          {isGenerating && generatedCaptions.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
              Captions are processing in the background. Return to this page and resume generation to check their progress.
            </div>
          ) : generatedCaptions.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
              No captions generated yet.
            </div>
          ) : (
            <div className="table-shell">
              <div className="overflow-x-auto">
                <table className="min-w-full table-base">
                  <thead className="table-head">
                    <tr>
                      <th>Id</th>
                      <th>Image Id</th>
                      <th>Caption</th>
                      <th>Humor Flavor</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {generatedCaptions.map((caption) => (
                      <tr
                        key={caption.id}
                        className="hover:bg-muted/50 transition-colors animate-in fade-in-0"
                      >
                        <td className="font-sans text-xs text-muted-foreground break-all">
                          {caption.id}
                        </td>
                        <td className="font-sans text-xs text-muted-foreground break-all">
                          {caption.image_id || "-"}
                        </td>
                        <td className="text-sm text-foreground max-w-[520px] whitespace-pre-wrap break-words">
                          {caption.content}
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {resolveFlavorLabel(caption.humor_flavor_id)}
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {caption.created_datetime_utc
                            ? new Date(caption.created_datetime_utc).toLocaleString("en-US", {
                                timeZone,
                                timeZoneName: "short",
                              })
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
