"use client";

import { memo, type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Pencil,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getAuthTokenAction } from "@/app/actions";
import {
  CaptionJobRequestError,
  imageGenerationProgress,
  runStudyCaptionJob,
  type GenerationStatus,
  type PendingStudyCaptionJob,
  type StudyCaptionJob,
} from "@/utils/study-caption-job";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import DedupeReview, { type DedupeReviewHandle } from "@/components/study/DedupeReview";
import { CopyStudyLinkButton } from "@/components/study/CopyStudyLinkButton";
import StudyPreview from "@/components/study/StudyPreview";
import { mappingToReviewItem } from "@/types/caption-review";
import { useToast } from "@/hooks/use-toast";
import { useTimeZone } from "@/components/TimeZoneContext";
import { cn } from "@/lib/utils";
import { getStudySiteUrl, STUDY_SITE_HOST } from "@/utils/study-site";
import { type DedupeLoadStatus } from "@/utils/study-dedupe";
import { CaptionService } from "@/services/captions.service";
import { StudyWizardService, type StudyWizardImageLibrary } from "@/services/study-wizard.service";
import type { ImagePickerImage } from "@/services/images.service";
import {
  StudiesService,
  StudyCaptionMappingsService,
  StudyImageSetImageMappingsService,
  StudyImageSetsService,
} from "@/services/studies.service";
import type { Study, StudyCaptionMappingWithCaptionDetails, StudyImageSet, StudyImageSetWithCount } from "@/types/study";
import type { HumorFlavor } from "@/types/humor-flavor";
import type Category from "@/types/common-use-category";
import {
  buildGenerateCaptionsPayload,
  buildStudyName,
  clearLegacyWizardDraft,
  combineImageSetMembers,
  ensureUniqueSlug,
  formatDateTimeDisplay,
  haveSameImageIds,
  normalizeSlug,
  reconcileImageSetSelection,
  toIsoOrNull,
  toLocalInputValue,
} from "./study-wizard-utils";

export type ImageSetWithCount = StudyImageSetWithCount;

type StudyWizardClientProps = {
  existingStudies: Study[];
  flavors: HumorFlavor[];
  existingImageSets: ImageSetWithCount[];
};

type PickerSort = "newest" | "oldest" | "az" | "za";

const selectedPickerRowClassName =
  "border-blue-600 bg-blue-50 hover:bg-blue-50 dark:border-cyan-300 dark:bg-cyan-950/60 dark:hover:bg-cyan-950/60";

type GenerationItem = {
  id: string;
  url?: string | null;
  description?: string | null;
  status: GenerationStatus;
  message?: string | null;
};

const statusBadgeStyles: Record<GenerationStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "border-border/60 bg-muted/40 text-muted-foreground" },
  generating: { label: "Generating", className: "border-primary/30 bg-primary/10 text-primary" },
  success: { label: "Done", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" },
  error: { label: "Failed", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

const SORT_OPTIONS: Array<{ value: PickerSort; label: string }> = [
  { value: "newest", label: "Recently added" },
  { value: "oldest", label: "Added earliest" },
  { value: "az", label: "Name A to Z" },
  { value: "za", label: "Name Z to A" },
];

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAPPING_CONCURRENCY = 5;
const CAPTION_API_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai").replace(/\/+$/, "");

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export default function StudyWizardClient({
  existingStudies,
  flavors,
  existingImageSets,
}: StudyWizardClientProps) {
  const { toast } = useToast();
  const { timeZone } = useTimeZone();

  // A single stable "now" for the whole wizard lifetime, so the suggested
  // name's date token and the default schedule don't drift on re-render.
  const [mountDate] = useState(() => new Date());

  // ----- Section 1: images -----
  const [imageSourceMode, setImageSourceMode] = useState<"existing" | "new">("existing");
  const [images, setImages] = useState<ImagePickerImage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageCategoryMap, setImageCategoryMap] = useState<Map<string, number[]>>(new Map());
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryLoadAttempt, setLibraryLoadAttempt] = useState(0);
  const libraryRequestRef = useRef<Promise<StudyWizardImageLibrary> | null>(null);

  useEffect(() => {
    if (imageSourceMode !== "new" || libraryLoaded) return;
    let alive = true;
    setIsLoadingLibrary(true);
    setLibraryError(false);
    const request = libraryRequestRef.current ??= StudyWizardService.loadImageLibrary();
    void request.then((library) => {
      if (!alive) return;
      setImages(library.images);
      setCategories(library.categories);
      setImageCategoryMap(library.imageCategoryMap);
      setIsLoadingLibrary(false);
      setLibraryLoaded(true);
    }, (error) => {
      if (libraryRequestRef.current === request) libraryRequestRef.current = null;
      if (!alive) return;
      console.error("Error loading wizard image library:", error);
      setIsLoadingLibrary(false);
      setLibraryError(true);
      toast({ title: "Could not load images", description: "Please try again.", variant: "destructive" });
    });
    return () => { alive = false; };
  }, [imageSourceMode, libraryLoaded, libraryLoadAttempt, toast]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [categoryFilterId, setCategoryFilterId] = useState<number | null>(null);
  const [imageSearch, setImageSearch] = useState("");
  const [imageSort, setImageSort] = useState<PickerSort>("newest");
  const [existingSetSearch, setExistingSetSearch] = useState("");
  const [existingSetSort, setExistingSetSort] = useState<PickerSort>("newest");
  const [selectedExistingImageSetIds, setSelectedExistingImageSetIds] = useState<number[]>([]);
  const selectedExistingImageSetIdsRef = useRef<number[]>([]);
  const [existingSetMemberIds, setExistingSetMemberIds] = useState<string[]>([]);
  const existingSetMembersRef = useRef(new Map<number, string[]>());
  const isLoadingSetRef = useRef(false);
  const [existingSetImageDetails, setExistingSetImageDetails] = useState<
    Map<string, { url: string | null; description: string | null }>
  >(new Map());
  const [isLoadingSet, setIsLoadingSet] = useState(false);
  const [newImageSetSlug, setNewImageSetSlug] = useState("");
  const [createdImageSet, setCreatedImageSet] = useState<StudyImageSet | null>(null);
  const createdImageSetMemberIdsRef = useRef<string[] | null>(null);

  // ----- Sections 2–4: humor flavor, generation, and results -----
  const [flavorSearch, setFlavorSearch] = useState("");
  const [flavorSort, setFlavorSort] = useState<PickerSort>("newest");
  const [selectedFlavorId, setSelectedFlavorId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<PendingStudyCaptionJob | null>(null);
  const pendingGenerationRef = useRef<PendingStudyCaptionJob | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const generationResultsRef = useRef<HTMLDivElement>(null);
  const [jobProgress, setJobProgress] = useState<StudyCaptionJob | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generationBlocked = isGenerating || pendingGeneration !== null || isLoadingSet;

  useEffect(() => () => generationControllerRef.current?.abort(), []);
  const [captionsFoundSoFar, setCaptionsFoundSoFar] = useState(0);
  const [generatedCaptions, setGeneratedCaptions] = useState<
    StudyCaptionMappingWithCaptionDetails[]
  >([]);
  const [dedupeChoice, setDedupeChoice] = useState<"yes" | "no" | null>(null);
  const [dedupeLoadStatus, setDedupeLoadStatus] = useState<DedupeLoadStatus>("waiting");
  const [dedupeHasPendingChanges, setDedupeHasPendingChanges] = useState(false);
  const [previewMappingIds, setPreviewMappingIds] = useState<number[] | null>(null);
  const dedupeReviewRef = useRef<DedupeReviewHandle>(null);
  const [generationItems, setGenerationItems] = useState<GenerationItem[]>([]);
  const [retryingImageId, setRetryingImageId] = useState<string | null>(null);
  const [editingCaptionId, setEditingCaptionId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingCaptionId, setSavingCaptionId] = useState<number | null>(null);
  const [duplicatingCaptionId, setDuplicatingCaptionId] = useState<number | null>(null);
  const [deletingMappingId, setDeletingMappingId] = useState<number | null>(null);
  const [isDeletingCaption, setIsDeletingCaption] = useState(false);

  // ----- Sections 5–7: caption review, visibility, and study details -----
  const [createdStudy, setCreatedStudy] = useState<Study | null>(null);
  const [customStudyName, setCustomStudyName] = useState<string | null>(null);
  const [studyDescription, setStudyDescription] = useState("");
  const [visibilityChoice, setVisibilityChoice] = useState<"public" | "private" | null>(null);
  const [studyStart, setStudyStart] = useState("");
  const [studyEnd, setStudyEnd] = useState("");
  const [confirmMakePublicOpen, setConfirmMakePublicOpen] = useState(false);
  const [isSavingStudy, setIsSavingStudy] = useState(false);
  const savingStudyRef = useRef(false);
  const [isStudySaved, setIsStudySaved] = useState(false);

  const existingSlugs = useMemo(
    () => new Set(existingStudies.map((s) => (s.slug ?? "").toLowerCase())),
    [existingStudies]
  );

  const selectedFlavor = useMemo(
    () => flavors.find((f) => f.id === selectedFlavorId) ?? null,
    [flavors, selectedFlavorId]
  );

  const suggestedCaptionCount = dedupeChoice === "yes" && previewMappingIds !== null
    ? previewMappingIds.length
    : generatedCaptions.length;
  const suggestedName = useMemo(
    () => buildStudyName(mountDate, timeZone, suggestedCaptionCount, selectedFlavor?.slug ?? ""),
    [mountDate, timeZone, suggestedCaptionCount, selectedFlavor?.slug]
  );
  const studyName = customStudyName ?? suggestedName;

  const imageDetailsById = useMemo(() => {
    const map = new Map<string, { url: string | null; description: string | null }>();
    for (const image of images) {
      map.set(image.id, { url: image.url ?? null, description: image.image_description ?? null });
    }
    for (const [id, details] of existingSetImageDetails) map.set(id, details);
    return map;
  }, [images, existingSetImageDetails]);

  // ---- Default schedule once, on mount (rounded to next 5 min, +1 day end) ----
  useEffect(() => {
    const rounded = new Date(Math.ceil(mountDate.getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS);
    const end = new Date(rounded.getTime() + ONE_DAY_MS);
    setStudyStart((prev) => prev || toLocalInputValue(rounded.toISOString(), timeZone));
    setStudyEnd((prev) => prev || toLocalInputValue(end.toISOString(), timeZone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Discard drafts saved by older versions; wizard progress stays in memory.
  useEffect(() => {
    clearLegacyWizardDraft();
  }, []);

  // ------------------------------------------------------------------
  // Section 1 helpers
  // ------------------------------------------------------------------
  const visibleExistingImageSets = useMemo(() => {
    const query = existingSetSearch.trim().toLowerCase();
    const filtered = existingImageSets.filter(
      (set) => !query || (set.slug ?? "").toLowerCase().includes(query)
    );
    return [...filtered].sort((a, b) => sortBySlugOrDate(a, b, existingSetSort));
  }, [existingImageSets, existingSetSearch, existingSetSort]);

  const filteredLibraryImages = useMemo(() => {
    const query = imageSearch.trim().toLowerCase();
    const filtered = images.filter((image) => {
      if (categoryFilterId != null) {
        const cats = imageCategoryMap.get(image.id) ?? [];
        if (!cats.includes(categoryFilterId)) return false;
      }
      if (!query) return true;
      return (
        image.id.toLowerCase().includes(query) ||
        (image.url ?? "").toLowerCase().includes(query) ||
        (image.image_description ?? "").toLowerCase().includes(query)
      );
    });
    return [...filtered].sort((a, b) => {
      if (imageSort === "az") return (a.id ?? "").localeCompare(b.id ?? "");
      if (imageSort === "za") return (b.id ?? "").localeCompare(a.id ?? "");
      const at = new Date(a.created_datetime_utc ?? 0).getTime();
      const bt = new Date(b.created_datetime_utc ?? 0).getTime();
      return imageSort === "oldest" ? at - bt : bt - at;
    });
  }, [images, imageSearch, imageSort, categoryFilterId, imageCategoryMap]);

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const loadExistingSetDetails = async (setId: number) => {
    const cached = existingSetMembersRef.current.get(setId);
    if (cached) return cached;
    const mappings = await StudyImageSetImageMappingsService.getMappingsByImageSetId(setId);
    const details = new Map<string, { url: string | null; description: string | null }>();
    for (const mapping of mappings) {
      const id = mapping.image_id ?? mapping.images?.id ?? null;
      if (!id) continue;
      details.set(id, {
        url: mapping.images?.url ?? null,
        description: mapping.images?.image_description ?? null,
      });
    }
    const ids = [...details.keys()];
    existingSetMembersRef.current.set(setId, ids);
    // Keep visited images available for caption previews after a set is removed.
    setExistingSetImageDetails((prev) => new Map([...prev, ...details]));
    return ids;
  };

  const applyExistingSetSelection = (setIds: number[]) => {
    const previousMembers = combineImageSetMembers(selectedExistingImageSetIdsRef.current, existingSetMembersRef.current);
    const nextMembers = combineImageSetMembers(setIds, existingSetMembersRef.current);
    selectedExistingImageSetIdsRef.current = setIds;
    setSelectedExistingImageSetIds(setIds);
    setExistingSetMemberIds(nextMembers);
    setSelectedImageIds((selected) => reconcileImageSetSelection(selected, previousMembers, nextMembers));
  };

  const handleToggleExistingSet = async (setId: number) => {
    if (generationBlocked || isLoadingSetRef.current || generationControllerRef.current) return;
    const currentIds = selectedExistingImageSetIdsRef.current;
    if (currentIds.includes(setId)) {
      applyExistingSetSelection(currentIds.filter((id) => id !== setId));
      return;
    }
    // Hold the selection steady until membership has loaded. This also prevents
    // generation from starting with only part of the selected sets available.
    isLoadingSetRef.current = true;
    setIsLoadingSet(true);
    try {
      const ids = await loadExistingSetDetails(setId);
      if (!ids.length) {
        toast({ title: "Image set is empty", description: "Pick a different set or build a new one.", variant: "destructive" });
        return;
      }
      applyExistingSetSelection([...currentIds, setId]);
    } catch {
      toast({ title: "Could not load the image set", description: "Please try selecting it again.", variant: "destructive" });
    } finally {
      isLoadingSetRef.current = false;
      setIsLoadingSet(false);
    }
  };

  // ------------------------------------------------------------------
  // Silent study / image-set creation (no explicit "create study" step)
  // ------------------------------------------------------------------
  const effectiveStudyName = useMemo(
    () => (studyName.trim() ? studyName : suggestedName),
    [studyName, suggestedName]
  );

  // createdStudy is state and lags a render behind the create call, so two
  // concurrent callers (double-click Generate, or Generate then Make Public before
  // the first resolves) would each see createdStudy==null and POST two studies.
  // Memoize the in-flight promise so only one createStudy request is ever sent.
  const studyPromiseRef = useRef<Promise<Study | null> | null>(null);
  const ensureStudy = (): Promise<Study | null> => {
    if (createdStudy) return Promise.resolve(createdStudy);
    if (studyPromiseRef.current) return studyPromiseRef.current;
    const promise = (async () => {
      const base = normalizeSlug(effectiveStudyName) || `study-${mountDate.getTime()}`;
      const uniqueSlug = ensureUniqueSlug(base, existingSlugs);
      const created = await StudiesService.createStudy({
        slug: uniqueSlug,
        description: studyDescription.trim() || null,
        start_datetime_utc: toIsoOrNull(studyStart, timeZone),
        end_datetime_utc: toIsoOrNull(studyEnd, timeZone),
        is_private: true,
      });
      if (created) {
        setCreatedStudy(created);
      } else {
        studyPromiseRef.current = null; // creation failed, allow a later retry
      }
      return created;
    })();
    studyPromiseRef.current = promise;
    return promise;
  };

  const createMappedImageSet = async (
    imageIds: string[],
    slug: string,
    description: string | null
  ): Promise<StudyImageSet | null> => {
    const created = await StudyImageSetsService.createImageSet({ slug, description });
    if (!created) return null;
    const mappings = await mapWithConcurrency(imageIds, MAPPING_CONCURRENCY, (imageId) =>
      StudyImageSetImageMappingsService.createMapping({
        study_image_set_id: created.id,
        image_id: imageId,
      })
    );
    if (mappings.some((mapping) => mapping == null)) {
      await StudyImageSetsService.deleteImageSet(created.id);
      return null;
    }
    return created;
  };

  // In "new set" mode, persist the full selection as the named reusable set.
  // The ref de-duplicates concurrent creation attempts and retains its members
  // so the API batch can reuse it when its images exactly match the targets.
  const imageSetPromiseRef = useRef<Promise<StudyImageSet | null> | null>(null);
  const ensureSavedImageSet = (imageIds: string[]): Promise<StudyImageSet | null> => {
    if (imageSourceMode !== "new") return Promise.resolve(null);
    if (createdImageSet) return Promise.resolve(createdImageSet);
    if (imageSetPromiseRef.current) return imageSetPromiseRef.current;
    const slug = normalizeSlug(newImageSetSlug);
    if (!slug) return Promise.resolve(null);
    const promise = (async () => {
      const created = await createMappedImageSet(imageIds, slug, null);
      if (!created) {
        imageSetPromiseRef.current = null;
        toast({ title: "Could not save the image set", variant: "destructive" });
        return null;
      }
      createdImageSetMemberIdsRef.current = [...imageIds];
      setCreatedImageSet(created);
      return created;
    })();
    imageSetPromiseRef.current = promise;
    return promise;
  };

  const generationSetSequenceRef = useRef(0);
  const ensureGenerationImageSetId = async (
    targetIds: string[],
    study: Study
  ): Promise<number | null> => {
    if (imageSourceMode === "existing") {
      const matchingSetId = selectedExistingImageSetIds.find((setId) =>
        haveSameImageIds(targetIds, existingSetMembersRef.current.get(setId) ?? [])
      );
      if (matchingSetId != null) return matchingSetId;
    }

    const savedSet = await ensureSavedImageSet(Array.from(selectedImageIds));
    if (
      savedSet &&
      createdImageSetMemberIdsRef.current &&
      haveSameImageIds(targetIds, createdImageSetMemberIdsRef.current)
    ) {
      return savedSet.id;
    }

    generationSetSequenceRef.current += 1;
    const studySlug = normalizeSlug(study.slug ?? "") || `study-${study.id}`;
    const batchSet = await createMappedImageSet(
      targetIds,
      `${studySlug}-generation-${Date.now()}-${generationSetSequenceRef.current}`,
      `Caption generation batch for study ${study.id}.`
    );
    return batchSet?.id ?? null;
  };

  // ------------------------------------------------------------------
  // Section 3: caption generation
  // ------------------------------------------------------------------
  const captionsByImageId = useMemo(() => {
    const map = new Map<string, StudyCaptionMappingWithCaptionDetails[]>();
    for (const mapping of generatedCaptions) {
      const imageId = mapping.captions?.image_id;
      if (!imageId) continue;
      const arr = map.get(imageId);
      if (arr) arr.push(mapping);
      else map.set(imageId, [mapping]);
    }
    return map;
  }, [generatedCaptions]);

  const genStatusByImageId = useMemo(() => {
    const map = new Map<string, GenerationItem>();
    for (const item of generationItems) map.set(item.id, item);
    return map;
  }, [generationItems]);

  const selectedImageOrder = useMemo(() => {
    const ordered = existingSetMemberIds.filter((id) => selectedImageIds.has(id));
    for (const id of selectedImageIds) if (!ordered.includes(id)) ordered.push(id);
    return ordered;
  }, [existingSetMemberIds, selectedImageIds]);

  const updatePendingGeneration = (pending: PendingStudyCaptionJob | null) => {
    // Retain the exact request for retries only while this wizard is mounted.
    pendingGenerationRef.current = pending;
    setPendingGeneration(pending);
  };

  const runGeneration = async (targetIds: string[]) => {
    if (generationControllerRef.current || savingStudyRef.current || isLoadingSetRef.current) return;
    let pending = pendingGenerationRef.current;
    if (!pending && (!selectedFlavor || targetIds.length === 0)) return;
    if (!pending && targetIds.length > 100) {
      toast({ title: "Select up to 100 images per generation", variant: "destructive" });
      return;
    }
    const controller = new AbortController();
    generationControllerRef.current = controller;
    const { signal } = controller;
    const imageIds = pending?.imageIds ?? targetIds;
    setIsGenerating(true);
    setGenerationError(null);
    setJobProgress(null);
    setGenerationItems((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      for (const id of imageIds) {
        const details = imageDetailsById.get(id);
        byId.set(id, { id, url: details?.url, description: details?.description, status: "queued" });
      }
      return Array.from(byId.values());
    });

    try {
      if (!pending) {
        const auth = await getAuthTokenAction();
        signal.throwIfAborted();
        const study = await ensureStudy();
        signal.throwIfAborted();
        if (!study) throw new Error("Could not create the study.");
        const studyImageSetId = await ensureGenerationImageSetId(imageIds, study);
        signal.throwIfAborted();
        if (!studyImageSetId) throw new Error("Could not prepare the selected images for caption generation.");
        pending = {
          apiUrl: CAPTION_API_URL,
          userId: auth.user.id,
          idempotencyKey: crypto.randomUUID(),
          request: buildGenerateCaptionsPayload(studyImageSetId, study.id, selectedFlavor!.slug),
          imageIds,
        };
        updatePendingGeneration(pending);
      }
      const studyId = pending.request.studyId;
      let loadedCaptionIds = new Set<string>();
      const result = await runStudyCaptionJob(pending, {
        apiUrl: CAPTION_API_URL,
        getAuth: getAuthTokenAction,
        signal,
        onAccepted: updatePendingGeneration,
        onProgress: async (job) => {
          signal.throwIfAborted();
          setJobProgress(job);
          setGenerationItems((items) => items.map((item) => imageIds.includes(item.id)
            ? { ...item, ...imageGenerationProgress(job, item.id) } : item));
          // Study mappings are committed by the worker with the saved captions.
          // Only reload when new results exist, rather than every status poll.
          if (job.captionIds.some((id) => !loadedCaptionIds.has(id))) {
            const mappings = await StudyCaptionMappingsService.getMappingsByStudyId(studyId);
            signal.throwIfAborted();
            loadedCaptionIds = new Set(mappings.flatMap((mapping) => mapping.caption_id && mapping.captions ? [mapping.caption_id] : []));
            if (job.captionIds.every((id) => loadedCaptionIds.has(id))) {
              setGeneratedCaptions(mappings);
              setCaptionsFoundSoFar(mappings.length);
            }
          }
        },
      });
      signal.throwIfAborted();
      if (result.captionIds.some((id) => !loadedCaptionIds.has(id))) {
        throw new Error("The job finished, but some saved captions could not be loaded. Resume generation to load them again.");
      }
      updatePendingGeneration(null);
      if (result.status === "failed" || result.status === "partially_completed") {
        toast({
          title: result.status === "failed" ? "Caption generation failed" : "Some captions failed",
          description: `${result.progress.failed} of ${result.progress.total} images failed. Check the generation status for details.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      if (signal.aborted) return;
      // A rejected submission never created work. A missing job cannot be resumed.
      // Uncertain requests retain the original key and accepted job ID.
      if (error instanceof CaptionJobRequestError && (error.status === 404
        || (!pendingGenerationRef.current?.jobId && error.status >= 400
          && error.status < 500 && ![401, 429].includes(error.status)))) {
        updatePendingGeneration(null);
      }
      const message = error instanceof Error ? error.message : "Please try again.";
      setGenerationError(message);
      if (!pendingGenerationRef.current) {
        setGenerationItems((items) => items.map((item) => imageIds.includes(item.id)
          ? { ...item, status: "error", message } : item));
      }
      toast({
        title: pendingGenerationRef.current ? "Caption progress paused" : "Failed to generate captions",
        description: message,
        variant: "destructive",
      });
    } finally {
      if (!signal.aborted) setIsGenerating(false);
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
    }
  };

  const handleGenerateAll = async () => {
    if (pendingGenerationRef.current) {
      await runGeneration([]);
      return;
    }
    const targets = selectedImageOrder.filter((id) => !captionsByImageId.get(id)?.length);
    if (targets.length === 0) {
      toast({
        title: "All selected images already have captions",
        description: "Use an image's Retry to regenerate a specific one.",
      });
      return;
    }
    await runGeneration(targets);
  };

  const handleRetryImage = async (imageId: string) => {
    if (generationBlocked) return;
    setRetryingImageId(imageId);
    await runGeneration([imageId]);
    setRetryingImageId(null);
  };

  const startEditCaption = (mapping: StudyCaptionMappingWithCaptionDetails) => {
    setEditingCaptionId(mapping.id);
    setEditingText(mapping.captions?.content ?? "");
  };

  const saveEditCaption = async (mapping: StudyCaptionMappingWithCaptionDetails) => {
    if (!mapping.caption_id) return;
    setSavingCaptionId(mapping.id);
    const trimmed = editingText.trim();
    const ok = await CaptionService.updateCaption(mapping.caption_id, trimmed);
    setSavingCaptionId(null);
    if (!ok) {
      toast({ title: "Could not save the caption", variant: "destructive" });
      return;
    }
    setGeneratedCaptions((prev) =>
      prev.map((m) =>
        m.id === mapping.id && m.captions
          ? { ...m, captions: { ...m.captions, content: trimmed } }
          : m
      )
    );
    setEditingCaptionId(null);
    toast({ title: "Caption updated" });
  };

  const duplicateCaption = async (mapping: StudyCaptionMappingWithCaptionDetails) => {
    if (!mapping.caption_id || !createdStudy) return;
    setDuplicatingCaptionId(mapping.id);
    const newCaptionId = await CaptionService.duplicateCaption(mapping.caption_id);
    if (newCaptionId) {
      await StudyCaptionMappingsService.createMapping({
        study_id: createdStudy.id,
        caption_id: newCaptionId,
      });
      const mappings = await StudyCaptionMappingsService.getMappingsByStudyId(createdStudy.id);
      setGeneratedCaptions(mappings);
      toast({ title: "Caption duplicated" });
    } else {
      toast({ title: "Could not duplicate the caption", variant: "destructive" });
    }
    setDuplicatingCaptionId(null);
  };

  const handleDeleteCaption = async (mapping: StudyCaptionMappingWithCaptionDetails) => {
    setIsDeletingCaption(true);
    // Remove the study mapping first (that's what takes the caption out of the
    // study and avoids a dangling FK), then delete the underlying caption row.
    // Without deleting the mapping, the caption reappears with null content on
    // the next reload.
    const mappingRemoved = await StudyCaptionMappingsService.deleteMapping(mapping.id);
    if (mapping.caption_id) await CaptionService.deleteCaption(mapping.caption_id);
    setIsDeletingCaption(false);
    setDeletingMappingId(null);
    if (mappingRemoved) {
      setGeneratedCaptions((prev) => prev.filter((m) => m.id !== mapping.id));
      toast({ title: "Caption deleted" });
    } else {
      toast({ title: "Failed to delete caption", variant: "destructive" });
    }
  };

  const statusCounts = useMemo(
    () =>
      generationItems.reduce(
        (acc, item) => {
          acc[item.status] += 1;
          return acc;
        },
        { queued: 0, generating: 0, success: 0, error: 0 }
      ),
    [generationItems]
  );
  const totalStatusCount = generationItems.length;
  const showGenerationStatus = totalStatusCount > 0 || pendingGeneration !== null;
  const completedStatusCount = statusCounts.success + statusCounts.error;
  const generationResultsReady = totalStatusCount > 0 && !isGenerating && pendingGeneration === null;
  const generationFinished = generationResultsReady && jobProgress !== null
    && ["completed", "partially_completed", "failed"].includes(jobProgress.status);

  useEffect(() => {
    if (generationFinished) {
      generationResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [generationFinished]);

  const progressPercent =
    jobProgress && ["completed", "partially_completed", "failed"].includes(jobProgress.status)
      ? 100
      : jobProgress && jobProgress.progress.totalSteps > 0
      ? Math.round((jobProgress.progress.completedSteps / jobProgress.progress.totalSteps) * 100)
      : totalStatusCount > 0 ? Math.round((completedStatusCount / totalStatusCount) * 100) : 0;

  const captionedCount = useMemo(
    () => selectedImageOrder.filter((id) => (captionsByImageId.get(id)?.length ?? 0) > 0).length,
    [selectedImageOrder, captionsByImageId]
  );
  const failedCount = useMemo(
    () =>
      selectedImageOrder.filter(
        (id) => !captionsByImageId.get(id)?.length && genStatusByImageId.get(id)?.status === "error"
      ).length,
    [selectedImageOrder, captionsByImageId, genStatusByImageId]
  );
  const imagesStepDone = selectedImageIds.size > 0;
  const flavorStepDone = selectedFlavorId != null;
  const generationStepDone =
    selectedImageOrder.length > 0 &&
    captionedCount === selectedImageOrder.length &&
    !generationBlocked;
  const dedupeReadyForPublish =
    generationStepDone &&
    (dedupeChoice === "no" || (dedupeChoice === "yes" && dedupeLoadStatus === "ready"));

  const handleDedupeChoiceChange = (choice: "yes" | "no") => {
    if (!generationStepDone || savingStudyRef.current || choice === dedupeChoice) return;
    dedupeReviewRef.current?.cancel();
    setDedupeChoice(choice);
    setDedupeLoadStatus("waiting");
    setDedupeHasPendingChanges(false);
    setPreviewMappingIds(null);
  };

  // ------------------------------------------------------------------
  // Finish the study with the selected visibility
  // ------------------------------------------------------------------
  const handleStartChange = (value: string) => {
    setStudyStart(value);
    const startIso = toIsoOrNull(value, timeZone);
    if (!startIso) return;
    setStudyEnd(
      toLocalInputValue(new Date(new Date(startIso).getTime() + ONE_DAY_MS).toISOString(), timeZone)
    );
  };

  const handleSaveStudy = async () => {
    if (savingStudyRef.current) return;
    if (generationBlocked) {
      toast({
        title: "Caption generation is still running",
        description: "Resume caption generation and wait for it to finish before saving this study.",
        variant: "destructive",
      });
      return;
    }
    if (!dedupeReadyForPublish) {
      toast({
        title: dedupeChoice === null ? "Choose whether to review similar captions" : "Caption review is not ready",
        description: dedupeChoice === null
          ? "Choose Yes to review groups, or No to keep all captions."
          : "Wait for the review groups to load, or choose No to keep all captions.",
        variant: "destructive",
      });
      return;
    }
    if (!visibilityChoice) {
      toast({ title: "Choose whether the study should be public or private", variant: "destructive" });
      return;
    }
    const makePublic = visibilityChoice === "public";
    const startIso = makePublic ? toIsoOrNull(studyStart, timeZone) : null;
    const endIso = makePublic ? toIsoOrNull(studyEnd, timeZone) : null;
    if (makePublic && (!startIso || !endIso || new Date(endIso) <= new Date(startIso))) {
      toast({
        title: "Invalid date range",
        description: "Choose a start and end time, with the end after the start.",
        variant: "destructive",
      });
      return;
    }

    savingStudyRef.current = true;
    setIsSavingStudy(true);
    try {
      if (dedupeChoice === "yes") {
        const saved = await dedupeReviewRef.current?.save();
        if (!saved) return;
      }
      const study = await ensureStudy();
      if (!study) {
        toast({ title: "Could not create the study", variant: "destructive" });
        return;
      }

      const desiredSlug = ensureUniqueSlug(normalizeSlug(effectiveStudyName), existingSlugs);
      const slugChanged = Boolean(desiredSlug) && desiredSlug !== study.slug;
      const updates = {
        description: studyDescription.trim() || null,
        start_datetime_utc: startIso,
        end_datetime_utc: endIso,
        ...(slugChanged ? { slug: desiredSlug } : {}),
      };
      const updated = makePublic
        ? await StudiesService.publishStudy(study.id, updates)
        : await StudiesService.updateStudy(study.id, { ...updates, is_private: true });

      if (updated) {
        setCreatedStudy(updated);
        setIsStudySaved(true);
      } else {
        toast({ title: makePublic ? "Failed to make study public" : "Failed to save private study", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: makePublic ? "Failed to make study public" : "Failed to save private study",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      savingStudyRef.current = false;
      setIsSavingStudy(false);
      setConfirmMakePublicOpen(false);
    }
  };

  const resetWizard = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (isStudySaved && createdStudy) {
    const studySiteUrl = getStudySiteUrl(createdStudy.id);

    return (
      <Card className="shadow-md">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-2xl font-semibold text-foreground">{createdStudy.is_private ? "Private study saved" : "Study made public"}</p>
          <p className="text-sm text-muted-foreground">
            {createdStudy.is_private ? (
              <>{createdStudy.slug ?? `Study ${createdStudy.id}`} is saved privately. You can review it or make it public later from Studies.</>
            ) : (
              <>{createdStudy.slug ?? `Study ${createdStudy.id}`} is now public on {STUDY_SITE_HOST} between{" "}
              {formatDateTimeDisplay(createdStudy.start_datetime_utc, timeZone)} and{" "}
              {formatDateTimeDisplay(createdStudy.end_datetime_utc, timeZone)}.</>
            )}
          </p>
          <div className="flex flex-col items-center gap-3 pt-2">
            {createdStudy.is_private ? (
              <Button asChild>
                <a href={`/study/${createdStudy.id}`}>Manage study</a>
              </Button>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <a
                    href={studySiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800"
                  >
                    {STUDY_SITE_HOST}/study/{createdStudy.id}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <CopyStudyLinkButton url={studySiteUrl} />
                </div>
                <Button asChild>
                  <a
                    href={studySiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Go to study
                    <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </>
            )}
            <Button variant="outline" onClick={resetWizard}>
              Create another study
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 [overflow-anchor:none]">
      {/* ---------------- Section 1: Choose images ---------------- */}
      <SectionCard number={1} title="Choose your images" done={imagesStepDone} disabled={generationBlocked || isSavingStudy} allowOverflow>
        <div className="space-y-4">
          <div className="inline-flex rounded-lg border border-border/60 p-1">
            <Button
              type="button"
              size="sm"
              variant={imageSourceMode === "existing" ? "default" : "ghost"}
              className="rounded-md"
              onClick={() => setImageSourceMode("existing")}
            >
              Use existing sets
            </Button>
            <Button
              type="button"
              size="sm"
              variant={imageSourceMode === "new" ? "default" : "ghost"}
              className="rounded-md"
              onClick={() => setImageSourceMode("new")}
            >
              Build new set
            </Button>
          </div>

          {imageSourceMode === "existing" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Input
                  aria-label="Search image sets"
                  placeholder="Search image sets by name..."
                  value={existingSetSearch}
                  onChange={(event) => setExistingSetSearch(event.target.value)}
                  className="min-w-0 flex-1"
                />
                <SortDropdown label="image sets" value={existingSetSort} onChange={setExistingSetSort} />
              </div>
              <div role="group" aria-label="Image sets" className="max-h-[280px] space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1">
                {visibleExistingImageSets.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">No image sets found.</p>
                ) : visibleExistingImageSets.map((set) => {
                  const isSelected = selectedExistingImageSetIds.includes(set.id);
                  return (
                    <label
                      key={set.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border-2 border-transparent p-3 transition-colors hover:bg-muted",
                        isSelected && selectedPickerRowClassName
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => void handleToggleExistingSet(set.id)}
                        className="h-5 w-5 shrink-0 accent-blue-600 dark:accent-cyan-300"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-foreground", isSelected ? "font-semibold" : "font-medium")}>{set.slug ?? `Image set ${set.id}`}</span>
                        <span className="block text-xs text-muted-foreground">{set.imageCount} image{set.imageCount === 1 ? "" : "s"}</span>
                      </span>
                      {isSelected ? <PickerSelectionBadge /> : null}
                    </label>
                  );
                })}
              </div>
              {isLoadingSet ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />Loading image set...</p> : null}
              {selectedExistingImageSetIds.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {selectedExistingImageSetIds.length} set{selectedExistingImageSetIds.length === 1 ? "" : "s"} selected · {existingSetMemberIds.length} unique images
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedExistingImageSetIds.map((setId) => {
                      const name = existingImageSets.find((set) => set.id === setId)?.slug ?? `Image set ${setId}`;
                      return (
                        <Button key={setId} type="button" size="sm" variant="outline" aria-label={`Remove image set ${name}`} onClick={() => void handleToggleExistingSet(setId)}>
                          {name}<span className="ml-2" aria-hidden="true">×</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {existingSetMemberIds.length > 0 ? (
                <ImagePickGrid
                  imageIds={existingSetMemberIds}
                  detailsById={imageDetailsById}
                  selectedIds={selectedImageIds}
                  onToggle={toggleImageSelection}
                  loading={isLoadingSet}
                  emptyLabel="The selected sets have no images."
                  headerLabel={`${
                    existingSetMemberIds.filter((id) => selectedImageIds.has(id)).length
                  } of ${existingSetMemberIds.length} selected`}
                  onSelectAll={() => setSelectedImageIds(new Set(existingSetMemberIds))}
                  onSelectNone={() => setSelectedImageIds(new Set())}
                />
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>New set name</Label>
                <Input
                  placeholder="fall-2024-batch-1"
                  value={newImageSetSlug}
                  onChange={(e) => setNewImageSetSlug(e.target.value)}
                />
              </div>
              <CategoryPills
                categories={categories}
                value={categoryFilterId}
                onChange={setCategoryFilterId}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SortPills value={imageSort} onChange={setImageSort} />
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by id, URL or description..."
                    value={imageSearch}
                    onChange={(e) => setImageSearch(e.target.value)}
                    className="pl-9 bg-background"
                  />
                </div>
              </div>
              <ImagePickGrid
                imageIds={filteredLibraryImages.map((i) => i.id)}
                detailsById={imageDetailsById}
                selectedIds={selectedImageIds}
                onToggle={toggleImageSelection}
                loading={isLoadingLibrary}
                emptyLabel={libraryError ? "Could not load the image library." : "No images match your filters."}
                headerLabel={`${selectedImageIds.size} selected`}
                onSelectAll={() =>
                  setSelectedImageIds(
                    (prev) => new Set([...prev, ...filteredLibraryImages.map((i) => i.id)])
                  )
                }
                onSelectNone={() => setSelectedImageIds(new Set())}
              />
              {libraryError ? (
                <Button type="button" variant="outline" onClick={() => setLibraryLoadAttempt((attempt) => attempt + 1)}>
                  Retry loading images
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ---------------- Section 2: Humor flavor ---------------- */}
      <SectionCard
        number={2}
        title="Choose your humor flavor"
        done={flavorStepDone}
        disabled={!imagesStepDone || generationBlocked || isSavingStudy}
      >
        <div className="space-y-4">
          {/* A nonmatching initial value prevents cmdk from scrolling to its first item on mount. */}
          <Command
            defaultValue="no-active-flavor"
            disablePointerSelection
            shouldFilter={false}
            label="Humor flavors"
            className="group/flavor-picker rounded-lg border border-border/60"
          >
            <div className="flex items-center gap-3 border-b border-border pr-3">
              <div className="min-w-0 flex-1 [&_[cmdk-input-wrapper]]:border-b-0">
                <CommandInput
                  placeholder="Search flavors by name or description..."
                  value={flavorSearch}
                  onValueChange={setFlavorSearch}
                  className="min-w-0"
                />
              </div>
              <SortDropdown label="humor flavors" value={flavorSort} onChange={setFlavorSort} />
            </div>
            <CommandList className="max-h-[240px]">
              <CommandEmpty>No humor flavors found.</CommandEmpty>
              <CommandGroup className="[&_[cmdk-group-items]]:space-y-1">
                {sortFlavors(flavors, flavorSearch, flavorSort).map((flavor) => {
                  const isSelected = flavor.id === selectedFlavorId;
                  return (
                    <CommandItem
                      key={flavor.id}
                      value={String(flavor.id)}
                      onSelect={() => setSelectedFlavorId(flavor.id)}
                      className={cn(
                        "flex items-center justify-between gap-3 cursor-pointer rounded-md border-2 border-transparent p-3 transition-colors data-[selected=true]:text-foreground",
                        // cmdk's active row is a keyboard target, not the chosen flavor.
                        "group-focus-within/flavor-picker:data-[selected=true]:ring-2 group-focus-within/flavor-picker:data-[selected=true]:ring-inset group-focus-within/flavor-picker:data-[selected=true]:ring-ring",
                        isSelected
                          ? [
                              selectedPickerRowClassName,
                              "data-[selected='true']:bg-blue-50 aria-selected:bg-blue-50 dark:data-[selected='true']:bg-cyan-950/60 dark:aria-selected:bg-cyan-950/60",
                            ]
                          : "data-[selected='true']:bg-transparent aria-selected:bg-transparent hover:bg-muted"
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cn("truncate text-foreground", isSelected ? "font-semibold" : "font-medium")}>{flavor.slug}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {flavor.description || "No description"}
                        </p>
                      </div>
                      {isSelected ? <PickerSelectionBadge /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </SectionCard>

      {/* ---------------- Section 3: Generate captions ---------------- */}
      <SectionCard
        number={3}
        title="Generate Captions"
        done={generationStepDone}
        disabled={isSavingStudy || (!pendingGeneration && (!imagesStepDone || !flavorStepDone))}
        subtitle={
          selectedImageIds.size > 0
            ? `${captionedCount} captioned · ${failedCount} failed · ${selectedImageIds.size} selected`
            : undefined
        }
      >
        <div>
          <div
            data-open={showGenerationStatus}
            className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-500 ease-out data-[open=true]:grid-rows-[1fr]"
          >
            <div className="min-h-0 overflow-hidden">
              {showGenerationStatus ? (
                <div className="pb-4">
                  <section aria-labelledby="caption-generation-status-title" className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                    <h3 id="caption-generation-status-title" className="text-lg font-semibold">Caption generation status</h3>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p role="status" className="text-sm text-muted-foreground">
                        {totalStatusCount > 0
                          ? `${completedStatusCount} of ${totalStatusCount} complete`
                          : "No images queued yet."}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {statusCounts.generating > 0 && (
                          <Badge
                            variant="secondary"
                            className={cn("font-sans", statusBadgeStyles.generating.className)}
                          >
                            {statusCounts.generating} running
                          </Badge>
                        )}
                        {statusCounts.success > 0 && (
                          <Badge
                            variant="secondary"
                            className={cn("font-sans", statusBadgeStyles.success.className)}
                          >
                            {statusCounts.success} done
                          </Badge>
                        )}
                        {statusCounts.error > 0 && (
                          <Badge variant="destructive" className="font-sans">
                            {statusCounts.error} failed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Caption generation progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progressPercent}
                      className="h-2 w-full rounded-full bg-muted/40"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="grid max-h-72 gap-3 overflow-y-auto pr-1">
                      {generationItems.map((item, index) => (
                        <StatusRow key={item.id} item={item} index={index} />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {isGenerating ? "Checking caption job" : pendingGeneration ? "Resume to check caption job" : "Generation finished"}
                      </span>
                      {(jobProgress?.jobId || pendingGeneration?.jobId) ? (
                        <a className="text-sm text-primary underline underline-offset-2" href={`/caption-job/${jobProgress?.jobId || pendingGeneration?.jobId}`} target="_blank" rel="noopener noreferrer">
                          View caption job details
                        </a>
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-4">
            {pendingGeneration && !isGenerating ? (
              <p className="text-sm text-muted-foreground">Resume generation to check the existing job and load its saved captions.</p>
            ) : null}
            {generationError ? <p role="alert" className="text-sm text-destructive">{generationError}</p> : null}

            {selectedImageOrder.length === 0 ? (
              <p className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                Select images in section 1 to caption them here.
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                onClick={handleGenerateAll}
                disabled={isGenerating || isLoadingSet || (!pendingGeneration && (selectedFlavorId == null || selectedImageIds.size === 0))}
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Generating... {captionsFoundSoFar} found
                  </span>
                ) : (
                  pendingGeneration ? "Resume generation" : "Generate captions"
                )}
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ---------------- Section 4: Caption generation results ---------------- */}
      <SectionCard
        ref={generationResultsRef}
        number={4}
        title="Caption Generation Results"
        done={generationStepDone}
        disabled={!generationResultsReady || isSavingStudy}
        subtitle={generationResultsReady ? `${generatedCaptions.length} caption${generatedCaptions.length === 1 ? "" : "s"}` : undefined}
      >
        {generationResultsReady ? (
          <div className="max-h-[480px] space-y-3 overflow-y-auto rounded-lg border border-border/60 p-3">
            {selectedImageOrder.map((imageId, index) => {
              const details = imageDetailsById.get(imageId);
              const caps = captionsByImageId.get(imageId) ?? [];
              const item = genStatusByImageId.get(imageId);
              return (
                <ImageCaptionBlock
                  key={imageId}
                  index={index}
                  url={details?.url ?? null}
                  captions={caps}
                  status={item?.status}
                  errorMessage={item?.message}
                  isRetrying={retryingImageId === imageId}
                  generationBlocked={generationBlocked || isSavingStudy}
                  editingCaptionId={editingCaptionId}
                  editingText={editingText}
                  savingCaptionId={savingCaptionId}
                  duplicatingCaptionId={duplicatingCaptionId}
                  onRetry={() => handleRetryImage(imageId)}
                  onStartEdit={startEditCaption}
                  onEditChange={setEditingText}
                  onSaveEdit={saveEditCaption}
                  onCancelEdit={() => setEditingCaptionId(null)}
                  onDuplicate={duplicateCaption}
                  onDelete={(m) => setDeletingMappingId(m.id)}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Finished captions will appear here after generation completes.</p>
        )}
      </SectionCard>

      {/* ---------------- Section 5: Optional caption review ---------------- */}
      <SectionCard
        number={5}
        title="Choose whether to review similar captions"
        done={dedupeReadyForPublish}
        disabled={!generationStepDone || isSavingStudy}
        subtitle={
          generatedCaptions.length > 0
            ? `${generatedCaptions.length} caption${generatedCaptions.length === 1 ? "" : "s"}`
            : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Yes opens an optional review that groups similar captions together. You decide which captions to keep.
            No skips the review and keeps every caption. Neither choice removes anything automatically.
          </p>
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-center text-sm">
            <p className="font-medium text-foreground">
              Would you like the option to review and remove similar captions?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                aria-pressed={dedupeChoice === "yes"}
                className={cn(
                  "min-w-20",
                  dedupeChoice === "yes" && "shadow-lg ring-2 ring-foreground ring-offset-2"
                )}
                onClick={() => handleDedupeChoiceChange("yes")}
              >
                Yes, review groups
              </Button>
              <Button
                type="button"
                aria-pressed={dedupeChoice === "no"}
                className={cn(
                  "min-w-20",
                  dedupeChoice === "no" && "shadow-lg ring-2 ring-foreground ring-offset-2"
                )}
                onClick={() => handleDedupeChoiceChange("no")}
              >
                No, keep all captions
              </Button>
            </div>
          </div>
          {dedupeChoice === "yes" ? (
            <div className="space-y-4">
              <h3 className="text-base font-semibold">Review groups and choose captions (optional)</h3>
              {dedupeLoadStatus === "error" ? (
                <p className="text-sm text-destructive">
                  The review groups could not be loaded. Retry below, or choose No to keep all captions.
                </p>
              ) : dedupeHasPendingChanges ? (
                <p className="text-sm text-muted-foreground">
                  Your caption selections will be saved when you finish the study.
                </p>
              ) : null}
              <DedupeReview
                ref={dedupeReviewRef}
                studyId={createdStudy?.id ?? null}
                mappings={generatedCaptions}
                loadingBlocked={!generationStepDone}
                loadingBlockedMessage="Captions are still being prepared."
                onPendingChangesChanged={setDedupeHasPendingChanges}
                onStatusChanged={setDedupeLoadStatus}
                onSelectionChanged={setPreviewMappingIds}
                onMappingsChanged={(remainingMappings) => {
                  setGeneratedCaptions(remainingMappings);
                  setCaptionsFoundSoFar(remainingMappings.length);
                }}
                onSaved={(remainingMappings) => {
                  setDedupeHasPendingChanges(false);
                  setGeneratedCaptions(remainingMappings);
                  setCaptionsFoundSoFar(remainingMappings.length);
                }}
              />
            </div>
          ) : dedupeChoice === "no" ? (
            <p className="text-sm text-muted-foreground">
              Skipped — all captions are kept. You can enable the review above.
            </p>
          ) : null}
        </div>
      </SectionCard>

      {/* ---------------- Section 6: Study visibility ---------------- */}
      <SectionCard
        number={6}
        title="Choose whether the study is public or private"
        done={visibilityChoice !== null}
        disabled={!dedupeReadyForPublish || isSavingStudy}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Public makes the study available on {STUDY_SITE_HOST} during the schedule you choose.
            Private saves the study without making it publicly available. You can make it public later from Studies.
          </p>
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-center text-sm">
            <p className="font-medium text-foreground">Should this study be public or private?</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                aria-pressed={visibilityChoice === "public"}
                className={cn("min-w-20", visibilityChoice === "public" && "shadow-lg ring-2 ring-foreground ring-offset-2")}
                onClick={() => setVisibilityChoice("public")}
              >
                Public
              </Button>
              <Button
                type="button"
                aria-pressed={visibilityChoice === "private"}
                className={cn("min-w-20", visibilityChoice === "private" && "shadow-lg ring-2 ring-foreground ring-offset-2")}
                onClick={() => setVisibilityChoice("private")}
              >
                Private
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ---------------- Section 7: Name and finish ---------------- */}
      <SectionCard
        number={7}
        title={visibilityChoice === "public" ? "Name and public schedule" : "Name and save study"}
        done={isStudySaved}
        disabled={!dedupeReadyForPublish || visibilityChoice === null || isSavingStudy}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Study name
              <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Sparkles className="h-3 w-3" /> suggested, editable
              </span>
            </Label>
            <Input
              value={studyName}
              onChange={(e) => setCustomStudyName(e.target.value)}
              placeholder={suggestedName}
            />
            {normalizeSlug(effectiveStudyName) &&
            existingSlugs.has(normalizeSlug(effectiveStudyName)) &&
            !createdStudy ? (
              <p className="text-xs text-amber-600">
                A study named “{normalizeSlug(effectiveStudyName)}” already exists, a suffix will be
                added to keep it unique.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="Optional details for this study..."
              value={studyDescription}
              onChange={(e) => setStudyDescription(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          {createdStudy ? (
            <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <p className="font-medium">Private preview — not publicly available</p>
              <p className="text-muted-foreground">
                {visibilityChoice === "public"
                  ? "The study stays private until you click Release study."
                  : "Saving a private study keeps it off the public study site."}
              </p>
              <StudyPreview
                name={effectiveStudyName}
                description={visibilityChoice === "public"
                  ? "This study is not publicly available. It stays private until you click Release study."
                  : "This study is not publicly available. Saving a private study keeps it off the public study site."}
                items={(dedupeChoice !== "yes" || previewMappingIds === null ? generatedCaptions : generatedCaptions.filter((mapping) => previewMappingIds.includes(mapping.id))).map(mappingToReviewItem)}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-4 sm:grid-cols-3">
            <Summary label="Images" value={`${selectedImageIds.size}`} />
            <Summary label="Humor flavor" value={selectedFlavor?.slug ?? "-"} />
            <Summary label="Captions" value={`${generatedCaptions.length}`} />
          </div>

          {visibilityChoice === "public" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={studyStart}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input
                  type="datetime-local"
                  value={studyEnd}
                  onChange={(e) => setStudyEnd(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              onClick={() => visibilityChoice === "public" ? setConfirmMakePublicOpen(true) : void handleSaveStudy()}
              disabled={isSavingStudy || !dedupeReadyForPublish || visibilityChoice === null}
            >
              {isSavingStudy ? "Releasing study..." : "Release study"}
            </Button>
          </div>
          {generationBlocked ? (
            <p className="text-xs text-muted-foreground">
              Resume caption generation and wait for it to finish before saving this study.
            </p>
          ) : !dedupeReadyForPublish && dedupeChoice !== null ? (
            <p className="text-xs text-muted-foreground">
              Wait for the review groups to load, or choose No to keep all captions.
            </p>
          ) : dedupeReadyForPublish && visibilityChoice === null ? (
            <p className="text-xs text-muted-foreground">Choose Public or Private in section 6 to finish the study.</p>
          ) : null}
          {visibilityChoice === "public" ? (
            <p className="text-xs text-muted-foreground">
              Public on {STUDY_SITE_HOST} between{" "}
              {formatDateTimeDisplay(toIsoOrNull(studyStart, timeZone), timeZone)} and{" "}
              {formatDateTimeDisplay(toIsoOrNull(studyEnd, timeZone), timeZone)}.
            </p>
          ) : visibilityChoice === "private" ? (
            <p className="text-xs text-muted-foreground">This study will remain private and will not be scheduled for public participation.</p>
          ) : null}
        </div>
      </SectionCard>

      {/* Delete-caption confirm */}
      <AlertDialog
        open={deletingMappingId != null}
        onOpenChange={(open) => {
          if (!open) setDeletingMappingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this caption?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCaption}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingCaption}
              onClick={() => {
                const mapping = generatedCaptions.find((m) => m.id === deletingMappingId);
                if (mapping) void handleDeleteCaption(mapping);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Make-public confirmation */}
      <AlertDialog open={confirmMakePublicOpen} onOpenChange={setConfirmMakePublicOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this study?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 font-medium text-amber-800 dark:text-amber-300">
                  <span aria-hidden className="mt-px">⚠️</span>
                  <span>
                    This makes the study public on {STUDY_SITE_HOST}. Real
                    participants will be able to see and rate these captions.
                    Double-check the captions below are correct (no broken or
                    placeholder text) before you make it public. You can make it private
                    again anytime from Studies.
                  </span>
                </p>
                <p className="text-muted-foreground">You&apos;re about to make public:</p>
                <ul className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-foreground">
                  <li>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    {normalizeSlug(effectiveStudyName) || "-"}
                  </li>
                  <li>
                    <span className="text-muted-foreground">Images:</span> {selectedImageIds.size} ·{" "}
                    <span className="text-muted-foreground">Captions:</span>{" "}
                    {generatedCaptions.length}
                  </li>
                  <li>
                    <span className="text-muted-foreground">Public:</span>{" "}
                    {formatDateTimeDisplay(toIsoOrNull(studyStart, timeZone), timeZone)} →{" "}
                    {formatDateTimeDisplay(toIsoOrNull(studyEnd, timeZone), timeZone)}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingStudy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isSavingStudy || visibilityChoice !== "public"} onClick={() => void handleSaveStudy()}>
              {isSavingStudy ? "Publishing study..." : "Yes, publish study"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function sortBySlugOrDate(
  a: { slug: string | null; created_datetime_utc: string },
  b: { slug: string | null; created_datetime_utc: string },
  sort: PickerSort
): number {
  if (sort === "az") return (a.slug ?? "").localeCompare(b.slug ?? "");
  if (sort === "za") return (b.slug ?? "").localeCompare(a.slug ?? "");
  const at = new Date(a.created_datetime_utc).getTime();
  const bt = new Date(b.created_datetime_utc).getTime();
  return sort === "oldest" ? at - bt : bt - at;
}

function sortFlavors(flavors: HumorFlavor[], search: string, sort: PickerSort): HumorFlavor[] {
  const query = search.trim().toLowerCase();
  const filtered = flavors.filter(
    (f) =>
      !query ||
      f.slug.toLowerCase().includes(query) ||
      (f.description ?? "").toLowerCase().includes(query)
  );
  return [...filtered].sort((a, b) => {
    if (sort === "az") return a.slug.localeCompare(b.slug);
    if (sort === "za") return b.slug.localeCompare(a.slug);
    const at = new Date(a.created_datetime_utc).getTime();
    const bt = new Date(b.created_datetime_utc).getTime();
    return sort === "oldest" ? at - bt : bt - at;
  });
}

function SortDropdown({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PickerSort;
  onChange: (value: PickerSort) => void;
}) {
  const selectedLabel = SORT_OPTIONS.find((option) => option.value === value)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 max-w-[45%] shrink-0"
          aria-label={`Sort ${label}: ${selectedLabel}`}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="truncate">Sort: {selectedLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* Keep menu keystrokes from navigating the surrounding flavor picker. */}
      <DropdownMenuContent align="end" className="w-48" onKeyDown={(event) => event.stopPropagation()}>
        <DropdownMenuRadioGroup
          aria-label={`Sort ${label}`}
          value={value}
          onValueChange={(nextValue) => {
            const option = SORT_OPTIONS.find((option) => option.value === nextValue);
            if (option) onChange(option.value);
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="focus:bg-muted focus:text-foreground"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortPills({ value, onChange }: { value: PickerSort; onChange: (v: PickerSort) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SORT_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function CategoryPills({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={value === null ? "default" : "outline"}
        onClick={() => onChange(null)}
      >
        All tags
      </Button>
      {categories.map((category) => (
        <Button
          key={category.id}
          type="button"
          size="sm"
          variant={value === category.id ? "default" : "outline"}
          onClick={() => onChange(value === category.id ? null : category.id)}
        >
          {category.name}
        </Button>
      ))}
    </div>
  );
}

function PickerSelectionBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white dark:bg-cyan-300 dark:text-slate-950">
      <Check className="h-4 w-4" aria-hidden="true" />
      Selected
    </span>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

type ImagePickGridProps = {
  imageIds: string[];
  detailsById: Map<string, { url: string | null; description: string | null }>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
  emptyLabel: string;
  headerLabel: string;
  onSelectAll: () => void;
  onSelectNone: () => void;
  // When true, the grid grows to fit all photos and the page scrolls (so you
  // can scroll down and see everything). When false it stays in a bounded
  // inner-scroll box (used for the large 200-image library).
  flow?: boolean;
};

function ImagePickGrid({
  imageIds,
  detailsById,
  selectedIds,
  onToggle,
  loading,
  emptyLabel,
  headerLabel,
  onSelectAll,
  onSelectNone,
  flow = false,
}: ImagePickGridProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{headerLabel}</p>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onSelectAll}>
            Select all
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onSelectNone}>
            Clear
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "rounded-lg border border-border/60 p-3",
          flow ? "" : "max-h-[55vh] overflow-y-auto"
        )}
      >
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading images...</p>
        ) : imageIds.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {imageIds.map((id) => {
              const details = detailsById.get(id);
              const isSelected = selectedIds.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg border bg-muted/20 transition-all",
                    isSelected
                      ? "scale-[0.97] border-2 border-blue-600 ring-2 ring-blue-600/30 dark:border-cyan-300 dark:bg-cyan-950/40 dark:ring-cyan-300/70"
                      : "border-border/60 dark:border-slate-600 dark:brightness-75"
                  )}
                >
                  {details?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={details.url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No preview
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white dark:border-cyan-200 dark:bg-cyan-300 dark:text-slate-950"
                        : "border-border bg-background/80 dark:border-slate-500 dark:bg-slate-950/90"
                    )}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type ImageCaptionBlockProps = {
  index: number;
  url: string | null;
  captions: StudyCaptionMappingWithCaptionDetails[];
  status?: GenerationStatus;
  errorMessage?: string | null;
  isRetrying: boolean;
  generationBlocked: boolean;
  editingCaptionId: number | null;
  editingText: string;
  savingCaptionId: number | null;
  duplicatingCaptionId: number | null;
  onRetry: () => void;
  onStartEdit: (m: StudyCaptionMappingWithCaptionDetails) => void;
  onEditChange: (v: string) => void;
  onSaveEdit: (m: StudyCaptionMappingWithCaptionDetails) => void;
  onCancelEdit: () => void;
  onDuplicate: (m: StudyCaptionMappingWithCaptionDetails) => void;
  onDelete: (m: StudyCaptionMappingWithCaptionDetails) => void;
};

function ImageCaptionBlock(props: ImageCaptionBlockProps) {
  const {
    index,
    url,
    captions,
    status,
    errorMessage,
    isRetrying,
    generationBlocked,
    editingCaptionId,
    editingText,
    savingCaptionId,
    duplicatingCaptionId,
    onRetry,
    onStartEdit,
    onEditChange,
    onSaveEdit,
    onCancelEdit,
    onDuplicate,
    onDelete,
  } = props;

  const hasCaptions = captions.length > 0;
  const failed = !hasCaptions && status === "error";
  const busy = !hasCaptions && (status === "generating" || status === "queued" || isRetrying);

  return (
    <div className="flex gap-3 rounded-lg border border-border/60 bg-card p-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/20">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            {index + 1}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {hasCaptions ? (
          captions.map((mapping) => {
            const isEditing = editingCaptionId === mapping.id;
            return (
              <div key={mapping.id} className="flex items-start gap-2">
                {isEditing ? (
                  <div className="flex-1 space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(e) => onEditChange(e.target.value)}
                      className="min-h-[60px]"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={generationBlocked || savingCaptionId === mapping.id}
                        onClick={() => onSaveEdit(mapping)}
                      >
                        {savingCaptionId === mapping.id ? "Saving..." : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="flex-1 text-sm text-foreground">
                      {mapping.captions?.content ?? "-"}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Edit caption"
                        disabled={generationBlocked}
                        onClick={() => onStartEdit(mapping)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Duplicate caption"
                        disabled={generationBlocked || duplicatingCaptionId === mapping.id}
                        onClick={() => onDuplicate(mapping)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive/80"
                        aria-label="Delete caption"
                        disabled={generationBlocked}
                        onClick={() => onDelete(mapping)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        ) : failed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="font-sans">
                Failed
              </Badge>
              <span className="text-xs text-muted-foreground">Image {index + 1}</span>
            </div>
            {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
            <Button size="sm" variant="outline" disabled={generationBlocked || isRetrying} onClick={onRetry}>
              <RotateCw className={cn("mr-1.5 h-3.5 w-3.5", isRetrying && "animate-spin")} />
              {isRetrying ? "Retrying..." : "Retry this image"}
            </Button>
          </div>
        ) : busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Generating...
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Image {index + 1}</span>
            <Badge
              variant="secondary"
              className="font-sans border-border/60 bg-muted/40 text-muted-foreground"
            >
              Not generated
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized so the poll loop's parent re-renders (every 2s) don't re-mount every
// row and replay animations, this is the flicker fix (note 9).
const StatusRow = memo(function StatusRow({
  item,
  index,
}: {
  item: GenerationItem;
  index: number;
}) {
  return (
    <div className="relative flex flex-wrap items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 pr-24 shadow-sm">
      <div className="flex items-center gap-3">
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
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
          {item.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          ) : null}
          {item.message ? (
            <p className={cn("text-xs", item.status === "error" ? "text-destructive" : "text-muted-foreground")}>{item.message}</p>
          ) : null}
        </div>
      </div>
      <Badge
        variant="secondary"
        className={cn("absolute right-3 top-3 font-sans", statusBadgeStyles[item.status].className)}
      >
        {item.status === "generating" && (
          <span className="mr-2 inline-flex h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {statusBadgeStyles[item.status].label}
      </Badge>
    </div>
  );
});

type SectionCardProps = {
  ref?: Ref<HTMLDivElement>;
  number: number;
  title: string;
  done: boolean;
  disabled?: boolean;
  subtitle?: string;
  children: ReactNode;
  // Lets a sticky child (the selection tray) escape the card's default
  // overflow-hidden clip so it can pin to the viewport while scrolling.
  allowOverflow?: boolean;
};

function SectionCard({
  ref,
  number,
  title,
  done,
  disabled = false,
  subtitle,
  children,
  allowOverflow,
}: SectionCardProps) {
  return (
    <Card
      ref={ref}
      aria-disabled={disabled}
      className={cn(
        "scroll-mt-20 shadow-sm transition-colors",
        allowOverflow && "overflow-visible",
        disabled && "border-muted bg-muted/30"
      )}
    >
      <CardHeader className={cn(disabled && "opacity-50 grayscale")}>
        <CardTitle className="flex items-center gap-3 text-xl leading-snug sm:text-2xl">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base text-primary">
            {number}
          </span>
          <span>{title}</span>
          {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : null}
          {subtitle ? (
            <span className="ml-auto text-xs font-normal text-muted-foreground">{subtitle}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <fieldset
          disabled={disabled}
          className={cn(
            "m-0 min-w-0 border-0 p-0",
            disabled && "pointer-events-none select-none opacity-50 grayscale"
          )}
        >
          {children}
        </fieldset>
      </CardContent>
    </Card>
  );
}
