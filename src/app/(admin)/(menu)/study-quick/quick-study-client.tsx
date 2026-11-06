"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ExternalLink, Eye, Info, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import CaptionArrayReview, { type CaptionArrayReviewHandle } from "@/components/study/CaptionArrayReview";
import { CopyStudyLinkButton } from "@/components/study/CopyStudyLinkButton";
import CaptionPreview from "@/components/study/CaptionPreview";
import { useToast } from "@/hooks/use-toast";
import { useTimeZone } from "@/components/TimeZoneContext";
import { cn } from "@/lib/utils";
import { isUUID } from "@/utils/utils";
import { getStudySiteUrl, STUDY_SITE_HOST } from "@/utils/study-site";
import { getCaptionReviewScopeKey, type DedupeLoadStatus } from "@/utils/study-dedupe";
import { uploadImageFile } from "@/services/image-file-upload.service";
import { CaptionService } from "@/services/captions.service";
import { ImageService } from "@/services/images.service";
import type { Study } from "@/types/study";
import type { CaptionReviewItem } from "@/types/caption-review";
import { CAPTION_ARRAY_REVIEW_LIMIT } from "@/services/caption-array-dedupe.service";
import { createQuickStudyJobRequest, submitQuickStudyJob, retryQuickStudyJob, watchQuickStudyJob, mergeQuickStudyProgress, isQuickStudyJobFinished, type QuickStudyCaption, type QuickStudyJobRequest } from "@/services/quick-study-preparation.service";
import { createQuickStudyReleaseState, releaseQuickStudy } from "@/services/quick-study-release.service";
import { buildQuickStudyName } from "@/utils/quick-study";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const QUICK_STUDY_STEP = {
  addCaptions: 0,
  reviewCaptions: 1,
  deduplicate: 2,
  publish: 3,
} as const;

type DedupeChoice = "yes" | "no" | null;
type Duo = QuickStudyCaption;

// Keys the importer consumes as the image/caption themselves — everything else
// on an import item is metadata.
const IMAGE_CAPTION_KEYS = new Set([
  "image_id",
  "imageId",
  "image_url",
  "imageUrl",
  "url",
  "caption",
  "text",
  "content",
]);

// Pull metadata out of a raw import item: recognized fields (flavor_id,
// flavor_name, user_id) are normalized, the original image reference is kept,
// and anything unrecognized is tucked under `other`. The whole thing is stored
// as the caption's `metadata` blob; flavorId/userId are also returned for
// mapping onto real caption columns.
function extractMeta(
  item: Record<string, unknown>,
  imageRef: string
): { flavorId: number | null; userId: string | null; meta: Record<string, unknown> | null } {
  const flavorRaw = item.flavor_id ?? item.flavorId;
  const flavorId =
    flavorRaw != null && flavorRaw !== "" && Number.isFinite(Number(flavorRaw))
      ? Number(flavorRaw)
      : null;
  const flavorName = (item.flavor_name ?? item.flavorName) as string | undefined;
  const userIdRaw = item.user_id ?? item.userId;
  const userId = typeof userIdRaw === "string" && userIdRaw.trim() ? userIdRaw.trim() : null;

  const other: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (!IMAGE_CAPTION_KEYS.has(k) && !RESERVED_META_KEYS.has(k)) other[k] = v;
  }

  const meta: Record<string, unknown> = {};
  if (flavorRaw != null && flavorRaw !== "") meta.flavor_id = flavorId ?? flavorRaw;
  if (flavorName) meta.flavor_name = flavorName;
  if (userId) meta.user_id = userId;
  if (imageRef) meta.image_ref = imageRef;
  if (Object.keys(other).length > 0) meta.other = other;

  return { flavorId, userId, meta: Object.keys(meta).length > 0 ? meta : null };
}

// Recognized metadata keys (mapped explicitly above) — kept out of `other`.
const RESERVED_META_KEYS = new Set([
  "flavor_id",
  "flavorId",
  "flavor_name",
  "flavorName",
  "user_id",
  "userId",
]);

// ----- small helpers (self-contained; the quick builder doesn't share the
// wizard's utils module) -----
function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function ensureUniqueSlug(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function getDateTimeParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function toLocalInputValue(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = getDateTimeParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function toIsoOrNull(value: string, timeZone: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) return null;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const gp = getDateTimeParts(utcGuess, timeZone);
  const guessDate = new Date(
    Date.UTC(Number(gp.year), Number(gp.month) - 1, Number(gp.day), Number(gp.hour), Number(gp.minute))
  );
  const desired = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return new Date(utcGuess.getTime() + (desired.getTime() - guessDate.getTime())).toISOString();
}

let keySeq = 0;
const nextKey = () => `duo-${keySeq++}`;

const focusCaptionInput = (input: HTMLInputElement | null) => {
  input?.focus({ preventScroll: true });
};

export default function QuickStudyClient({ existingStudies }: { existingStudies: Study[] }) {
  const { toast } = useToast();
  const { timeZone } = useTimeZone();
  const [mountDate] = useState(() => new Date());

  const [rows, setRows] = useState<Duo[]>([]);
  const [imageRef, setImageRef] = useState("");
  const [caption, setCaption] = useState("");
  const [adding, setAdding] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const addSectionRef = useRef<HTMLDivElement>(null);
  const captionsSectionRef = useRef<HTMLDivElement>(null);
  const dedupeSectionRef = useRef<HTMLDivElement>(null);
  const publishSectionRef = useRef<HTMLDivElement>(null);
  const [unlockedThroughStep, setUnlockedThroughStep] = useState<number>(QUICK_STUDY_STEP.addCaptions);

  const existingSlugs = useMemo(
    () => new Set(existingStudies.map((s) => (s.slug ?? "").toLowerCase())),
    [existingStudies]
  );

  const [customStudyName, setCustomStudyName] = useState<string | null>(null);
  const [studyStart, setStudyStart] = useState(() =>
    toLocalInputValue(
      new Date(Date.now() - TEN_MINUTES_MS).toISOString(),
      timeZone
    )
  );
  const [studyEnd, setStudyEnd] = useState(() =>
    toLocalInputValue(
      new Date(Date.now() + ONE_DAY_MS - TEN_MINUTES_MS).toISOString(),
      timeZone
    )
  );

  const [createdStudy, setCreatedStudy] = useState<Study | null>(null);
  const releaseStateRef = useRef(createQuickStudyReleaseState());
  const releaseInFlightRef = useRef(false);
  const [releaseUncertain, setReleaseUncertain] = useState(false);
  const [dedupeChoice, setDedupeChoice] = useState<DedupeChoice>(null);
  const [dedupeState, setDedupeState] = useState<{ status: DedupeLoadStatus; scope: string }>({ status: "waiting", scope: "" });
  const [selectedCaptionIds, setSelectedCaptionIds] = useState<Set<string>>(() => new Set());
  const dedupeReviewRef = useRef<CaptionArrayReviewHandle>(null);
  const handleDedupeStatusChanged = useCallback((status: DedupeLoadStatus, scope: string) => setDedupeState({ status, scope }), []);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [captionGenerationError, setCaptionGenerationError] = useState<string | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [watchVersion, setWatchVersion] = useState(0);
  const importRequestRef = useRef<QuickStudyJobRequest | null>(null);
  const importSubmissionRef = useRef(false);
  const restoreJobRowsRef = useRef(false);
  const savedImmediatelyRef = useRef(false);
  const classifiedImagesRef = useRef(new Set<string>());
  const [deletingCaptionKey, setDeletingCaptionKey] = useState<string | null>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const captionSavesInFlightRef = useRef<Set<string>>(new Set());
  const [savingCaptionKeys, setSavingCaptionKeys] = useState<Set<string>>(() => new Set());
  const [releasing, setReleasing] = useState(false);
  const [creatingPrivateStudy, setCreatingPrivateStudy] = useState(false);
  const [released, setReleased] = useState(false);

  const savedCaptionCount = rows.filter(row => row.status === "complete" && row.captionId).length;
  const allCaptionsGenerated = rows.length > 0 && savedCaptionCount === rows.length;
  const reviewItems = useMemo<CaptionReviewItem[]>(() => rows.flatMap(row => row.captionId && row.status === "complete" ? [{
    id: row.captionId, caption: row.caption, imageId: row.imageId, imageUrl: row.previewUrl,
  }] : []), [rows]);
  const includedRows = useMemo(() => dedupeChoice === "yes" ? rows.filter(row => row.captionId && selectedCaptionIds.has(row.captionId)) : rows, [dedupeChoice, selectedCaptionIds, rows]);
  const includedItems = useMemo(() => dedupeChoice === "yes" ? reviewItems.filter(item => selectedCaptionIds.has(item.id)) : reviewItems, [dedupeChoice, reviewItems, selectedCaptionIds]);
  const reviewScope = getCaptionReviewScopeKey(reviewItems);
  const dedupeLoadStatus = dedupeState.scope === reviewScope ? dedupeState.status : "waiting";
  const suggestedName = buildQuickStudyName(includedRows, mountDate, timeZone);
  const studyName = customStudyName ?? suggestedName;
  const activeCaptionCount = released ? includedItems.length : rows.length;
  const captionsStepComplete = !generatingCaptions && allCaptionsGenerated;
  const dedupeDecisionComplete = captionsStepComplete && dedupeChoice !== null;
  const captionGenerationFailed = rows.some(row => row.status === "error") || (!!captionGenerationError && !generatingCaptions);
  const releaseLocked = creatingPrivateStudy || releasing || releaseUncertain;
  const inputsLocked = unlockedThroughStep > QUICK_STUDY_STEP.addCaptions || generatingCaptions || released || releaseLocked;
  const reviewLocked = unlockedThroughStep < QUICK_STUDY_STEP.reviewCaptions || released || releaseLocked;
  const choiceLocked = unlockedThroughStep < QUICK_STUDY_STEP.deduplicate || !captionsStepComplete || released || releaseLocked;
  const groupReviewLocked = choiceLocked || dedupeChoice !== "yes";
  const publishLocked = unlockedThroughStep < QUICK_STUDY_STEP.publish || !dedupeDecisionComplete || !createdStudy || creatingPrivateStudy || released;

  const scrollToSection = (sectionRef: { current: HTMLDivElement | null }) => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (unlockedThroughStep === QUICK_STUDY_STEP.reviewCaptions) {
      scrollToSection(captionsSectionRef);
    } else if (unlockedThroughStep === QUICK_STUDY_STEP.deduplicate) {
      scrollToSection(dedupeSectionRef);
    } else if (unlockedThroughStep === QUICK_STUDY_STEP.publish) {
      scrollToSection(publishSectionRef);
    }
  }, [unlockedThroughStep]);

  useEffect(() => {
    const jobId = new URL(window.location.href).searchParams.get("importJob");
    if (!jobId || !isUUID(jobId)) return;
    restoreJobRowsRef.current = true;
    setImportJobId(jobId);
    setGeneratingCaptions(true);
    setUnlockedThroughStep(QUICK_STUDY_STEP.reviewCaptions);
  }, []);

  useEffect(() => {
    if (!importJobId) return;
    const controller = new AbortController();
    void watchQuickStudyJob(importJobId, {
      signal: controller.signal,
      savedImmediately: savedImmediatelyRef.current,
      classifiedImages: classifiedImagesRef.current,
      onProgress: (job) => {
        savedImmediatelyRef.current = job.savedImmediately === true;
        const restore = restoreJobRowsRef.current;
        restoreJobRowsRef.current = false;
        setRows(current => restore ? job.rows : mergeQuickStudyProgress(current, job.rows));
        setCaptionGenerationError(null);
        setGeneratingCaptions(!job.savedImmediately && !isQuickStudyJobFinished(job));
      },
      onConnectionError: (message, terminal) => {
        setCaptionGenerationError(message);
        if (terminal) setGeneratingCaptions(false);
      },
    });
    return () => controller.abort();
  }, [importJobId, watchVersion]);

  const rememberImportJob = (jobId: string | null) => {
    const url = new URL(window.location.href);
    if (jobId) url.searchParams.set("importJob", jobId);
    else url.searchParams.delete("importJob");
    window.history.replaceState(window.history.state, "", url);
  };

  const buildRowFromRef = async (ref: string, captionText: string): Promise<Duo> => {
    const key = nextKey();
    const trimmed = ref.trim();
    if (isUUID(trimmed)) {
      const image = await ImageService.getImageById(trimmed);
      if (!image) {
        return {
          key,
          imageId: null,
          pendingUrl: null,
          previewUrl: null,
          caption: captionText,
          status: "invalid",
          message: "No image with this id",
        };
      }
      return {
        key,
        imageId: image.id,
        pendingUrl: null,
        previewUrl: image.url,
        caption: captionText,
        status: "ready",
      };
    }
    if (isHttpUrl(trimmed)) {
      return {
        key,
        imageId: null,
        pendingUrl: trimmed,
        previewUrl: trimmed,
        caption: captionText,
        status: "needs-upload",
      };
    }
    return {
      key,
      imageId: null,
      pendingUrl: null,
      previewUrl: null,
      caption: captionText,
      status: "invalid",
      message: "Not an image id or url",
    };
  };

  const handleAddOne = async () => {
    if (!imageRef.trim() || !caption.trim()) return;
    setAdding(true);
    const row = await buildRowFromRef(imageRef, caption.trim());
    setAdding(false);
    if (row.status === "invalid") {
      toast({ title: "Could not add", description: row.message ?? "Invalid image", variant: "destructive" });
      return;
    }
    setRows((prev) => [...prev, row]);
    setImageRef("");
    setCaption("");
  };

  const buildRowsFromJson = async (raw: string): Promise<Duo[] | null> => {
    setJsonError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setJsonError("Invalid JSON. Check the formatting and try again.");
      return null;
    }
    if (!Array.isArray(parsed)) {
      setJsonError("Invalid JSON. The top-level value must be an array of captions.");
      return null;
    }
    setImporting(true);
    try {
      const built = (await Promise.all(parsed.map(async (value): Promise<Duo | null> => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const item = value as Record<string, unknown>;
        const ref = String(item.image_id ?? item.imageId ?? item.image_url ?? item.imageUrl ?? item.url ?? "");
        const cap = String(item.caption ?? item.text ?? item.content ?? "");
        if (!ref || !cap) return null;
        const row = await buildRowFromRef(ref, cap);
        const { flavorId, userId, meta } = extractMeta(item, ref);
        return { ...row, flavorId, userId, meta };
      }))).filter((row): row is Duo => row !== null);

      const validRows = built.filter((row) => row.status !== "invalid");
      if (validRows.length === 0) {
        setJsonError("No valid captions found. Each item needs an image and caption text.");
        return null;
      }

      const bad = built.filter((row) => row.status === "invalid").length;
      if (bad > 0) {
        toast({
          title: `${bad} caption${bad === 1 ? " was" : "s were"} skipped`,
          description: "The image id or URL could not be resolved.",
          variant: "destructive",
        });
      }
      return validRows;
    } catch {
      setJsonError("The JSON could not be imported. Check its contents and try again.");
      return null;
    } finally {
      setImporting(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    setUploadingFile(true);
    try {
      const res = await uploadImageFile(file);
      const image = res.image;
      if (!image?.id) throw new Error("Upload did not return an image id.");
      setImageRef(image.id);
      toast({ title: "Image uploaded", description: "Enter its caption, then add it." });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const captionsReady =
    rows.length > 0 &&
    rows.every((r) => r.caption.trim() && r.status !== "invalid");
  const canGenerateCaptions = captionsReady;
  const startIso = toIsoOrNull(studyStart, timeZone);
  const endIso = toIsoOrNull(studyEnd, timeZone);
  const validSchedule = !!startIso && !!endIso && Date.parse(startIso) < Date.parse(endIso);
  const canSaveStudy = dedupeDecisionComplete && !!normalizeSlug(studyName) && validSchedule &&
    includedItems.length > 0 && (dedupeChoice === "no" || dedupeLoadStatus === "ready") &&
    Object.keys(captionDrafts).length === 0 && savingCaptionKeys.size === 0 && deletingCaptionKey === null;
  const canPublish = !publishLocked && canSaveStudy;

  const handleGenerateCaptions = async (captionRows: Duo[] = rows) => {
    const captionRowsReady =
      captionRows.length > 0 &&
      captionRows.every((row) => row.caption.trim() && row.status !== "invalid");
    if ((!captionRowsReady && !importJobId) || importSubmissionRef.current || generatingCaptions || releaseLocked || released) return;
    importSubmissionRef.current = true;
    setGeneratingCaptions(true);
    setCaptionGenerationError(null);

    try {
      if (importJobId) {
        await retryQuickStudyJob(importJobId);
        setWatchVersion(current => current + 1);
      } else {
        // Keep the original request even if the submission response is lost.
        // Retrying must not create a second job for the same captions.
        importRequestRef.current ??= createQuickStudyJobRequest(captionRows);
        rememberImportJob(importRequestRef.current.jobId);
        const saved = await submitQuickStudyJob(importRequestRef.current);
        if (saved.savedImmediately && Array.isArray(saved.rows)) {
          savedImmediatelyRef.current = true;
          setRows(saved.rows);
          setGeneratingCaptions(false);
        }
        setImportJobId(importRequestRef.current.jobId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
      setCaptionGenerationError(message);
      setRows((previous) => previous.map((row) =>
        !importJobId && row.status !== "complete" ? { ...row, status: "error", message } : row
      ));
      toast({ title: "Could not save captions", description: message, variant: "destructive" });
      setGeneratingCaptions(false);
    } finally {
      importSubmissionRef.current = false;
    }
  };

  const handleAddCaptionsNext = async () => {
    if (inputsLocked || adding || importing || uploadingFile || generatingCaptions) return;

    let captionRows = rows;
    if (jsonText.trim()) {
      const importedRows = await buildRowsFromJson(jsonText);
      if (!importedRows) return;
      captionRows = [...rows, ...importedRows];
    }

    const captionRowsReady =
      captionRows.length > 0 &&
      captionRows.every((row) => row.caption.trim() && row.status !== "invalid");
    if (!captionRowsReady) return;

    try {
      importRequestRef.current = createQuickStudyJobRequest(captionRows);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Check the import and try again.");
      return;
    }
    setRows(captionRows);
    setUnlockedThroughStep((current) => Math.max(current, QUICK_STUDY_STEP.reviewCaptions));
    void handleGenerateCaptions(captionRows);
  };

  const handleCaptionsNext = () => {
    if (!captionsStepComplete) return;
    setUnlockedThroughStep((current) => Math.max(current, QUICK_STUDY_STEP.deduplicate));
  };

  const handleDedupeReviewNext = async () => {
    if (releaseInFlightRef.current || choiceLocked || !canSaveStudy || !startIso || !endIso) return;
    releaseInFlightRef.current = true;
    setCreatingPrivateStudy(true);
    try {
      const study = await releaseQuickStudy(releaseStateRef.current, {
        slug: ensureUniqueSlug(normalizeSlug(studyName), existingSlugs),
        captionIds: includedItems.map(item => item.id),
        start: startIso,
        end: endIso,
        visibility: "private",
      });
      setCreatedStudy(study);
      rememberImportJob(null);
      setUnlockedThroughStep(QUICK_STUDY_STEP.publish);
      if (unlockedThroughStep === QUICK_STUDY_STEP.publish) scrollToSection(publishSectionRef);
    } catch (error) {
      toast({ title: "Could not save the private study", description: error instanceof Error ? error.message : "Please retry.", variant: "destructive" });
    } finally {
      releaseInFlightRef.current = false;
      setCreatingPrivateStudy(false);
    }
  };

  const handleDedupeChoiceChange = (choice: Exclude<DedupeChoice, null>) => {
    if (choiceLocked || (choice === "yes" && rows.length > CAPTION_ARRAY_REVIEW_LIMIT)) return;
    if (choice === dedupeChoice) {
      scrollToSection(dedupeSectionRef);
      return;
    }
    dedupeReviewRef.current?.cancel();
    setDedupeChoice(choice);
    setDedupeState({ status: "waiting", scope: "" });
    setUnlockedThroughStep(QUICK_STUDY_STEP.deduplicate);
  };

  const handleEditCaption = (row: Duo) => {
    if (releaseLocked || released) return;
    setCaptionDrafts((current) => ({ ...current, [row.key]: row.caption }));
  };

  const handleSaveCaption = async (row: Duo) => {
    if (!row.captionId || captionSavesInFlightRef.current.has(row.key) || deletingCaptionKey !== null || releaseLocked || released) return;
    const nextCaption = captionDrafts[row.key]?.trim();
    if (!nextCaption) {
      toast({ title: "Caption cannot be empty", variant: "destructive" });
      return;
    }

    if (nextCaption !== row.caption) dedupeReviewRef.current?.cancel();
    captionSavesInFlightRef.current.add(row.key);
    setSavingCaptionKeys((current) => new Set(current).add(row.key));
    const saved = nextCaption === row.caption || await CaptionService.updateCaption(row.captionId, nextCaption);
    captionSavesInFlightRef.current.delete(row.key);
    setSavingCaptionKeys((current) => {
      const next = new Set(current);
      next.delete(row.key);
      return next;
    });

    if (!saved) {
      toast({ title: "Could not save the caption", variant: "destructive" });
      return;
    }

    setRows((current) => current.map((candidate) =>
      candidate.key === row.key ? { ...candidate, caption: nextCaption } : candidate
    ));
    setCaptionDrafts((current) => {
      const next = { ...current };
      delete next[row.key];
      return next;
    });
  };

  const handleDeleteCaption = async (row: Duo) => {
    if (!row.captionId || deletingCaptionKey || releaseLocked || released) return;
    dedupeReviewRef.current?.cancel();
    setDeletingCaptionKey(row.key);
    const deleted = await CaptionService.deleteCaption(row.captionId);
    setDeletingCaptionKey(null);

    if (!deleted) {
      toast({ title: "Could not delete the caption", variant: "destructive" });
      return;
    }

    setRows((current) => current.filter((candidate) => candidate.key !== row.key));
    setSelectedCaptionIds(current => {
      const next = new Set(current);
      next.delete(row.captionId!);
      return next;
    });
    setCaptionDrafts((current) => {
      const next = { ...current };
      delete next[row.key];
      return next;
    });
    toast({ title: "Caption deleted" });
  };

  const handleReleaseStudy = async () => {
    if (releaseInFlightRef.current || !canPublish || !startIso || !endIso) return;
    releaseInFlightRef.current = true;
    setReleasing(true);
    try {
      const study = await releaseQuickStudy(releaseStateRef.current, {
        slug: ensureUniqueSlug(normalizeSlug(studyName), existingSlugs),
        captionIds: includedItems.map(item => item.id),
        start: startIso,
        end: endIso,
        visibility: "public",
      });
      setCreatedStudy(study);
      setReleased(true);
    } catch (error) {
      toast({ title: "Could not finish the release", description: error instanceof Error ? error.message : "Please retry.", variant: "destructive" });
    } finally {
      setCreatedStudy(releaseStateRef.current.study);
      setReleaseUncertain(releaseStateRef.current.publicationUncertain);
      releaseInFlightRef.current = false;
      setReleasing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---- Add captions ---- */}
      <Card ref={addSectionRef} className="scroll-mt-6 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">1. Add captions</CardTitle>
          {inputsLocked ? <p className="text-sm text-muted-foreground">Imported input is kept here for reference. Edit individual captions in step 2.</p> : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset disabled={inputsLocked} className="min-w-0 space-y-6">
          {/* one at a time */}
          <div className="space-y-3">
            <Label>Add one</Label>
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Image id or url</span>
                <Input
                  placeholder="image id (uuid) or https://..."
                  value={imageRef}
                  onChange={(e) => setImageRef(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Caption</span>
                <Input
                  placeholder="The caption for this image"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddOne();
                  }}
                />
              </div>
              <Button onClick={handleAddOne} disabled={adding || !imageRef.trim() || !caption.trim()}>
                {adding ? "Adding..." : "Add caption"}
              </Button>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadFile(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadingFile ? "Uploading..." : "Or upload an image file"}
              </Button>
            </div>
          </div>

          {/* JSON import */}
          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="flex items-center gap-1">
              <Label>Import a JSON list</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    aria-label="JSON import information"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(calc(100vw-2rem),28rem)] space-y-3 text-sm">
                  <p>
                    Paste a JSON array of captions. Each item needs an image and text; the rest is optional metadata.
                  </p>
                  <ul className="ml-4 list-disc space-y-1.5">
                    <li><code className="rounded bg-muted px-1">image_id</code> — required. An image url or a uuid (<code className="rounded bg-muted px-1">image_url</code> / <code className="rounded bg-muted px-1">url</code> also work).</li>
                    <li><code className="rounded bg-muted px-1">caption</code> — required. The caption text.</li>
                    <li><code className="rounded bg-muted px-1">flavor_id</code> — optional. Sets the caption&apos;s humor flavor if that id exists here.</li>
                    <li><code className="rounded bg-muted px-1">user_id</code> — optional. The author&apos;s profile id, if it exists here.</li>
                    <li><code className="rounded bg-muted px-1">flavor_name</code> and any other keys are stored as-is in the caption&apos;s metadata.</li>
                  </ul>
                </PopoverContent>
              </Popover>
            </div>
            <Textarea
              placeholder={`[
  {
    "image_id": "https://… or uuid",
    "caption": "the caption",
    "flavor_id": "1542",
    "flavor_name": "multi-person-scene-SAD-GIRL",
    "user_id": "42129dcc-…"
  }
]`}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              className="min-h-[220px] font-mono text-xs"
            />
            {jsonError ? (
              <p role="alert" className="text-sm text-destructive">{jsonError}</p>
            ) : null}
            <div className="flex flex-col items-start gap-2 text-left">
              <input
                ref={jsonFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setImporting(true);
                    setJsonError(null);
                    try {
                      setJsonText(await f.text());
                    } catch {
                      setJsonError("The JSON file could not be read. Try another file.");
                    } finally {
                      setImporting(false);
                    }
                  }
                  if (jsonFileRef.current) jsonFileRef.current.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Import JSON from file"
                disabled={importing}
                onClick={() => jsonFileRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload JSON file
              </Button>
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button
              type="button"
              size="lg"
              className="bg-red-600 px-10 text-white hover:bg-red-700"
              disabled={(!canGenerateCaptions && !jsonText.trim()) || adding || importing || uploadingFile}
              onClick={() => void handleAddCaptionsNext()}
            >
              {importing ? "Loading captions and images" : "Next"}
            </Button>
          </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* ---- Captions list ---- */}
      <Card
        ref={captionsSectionRef}
        className={cn(
          "scroll-mt-6 shadow-sm transition-colors",
          reviewLocked && "border-muted bg-muted/30 opacity-50 grayscale"
        )}
      >
        <CardHeader>
          <CardTitle className="text-base">
            2. Review captions{rows.length > 0 ? ` (${rows.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={reviewLocked || releasing} className="min-w-0 space-y-4">
          {unlockedThroughStep < QUICK_STUDY_STEP.reviewCaptions ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Add captions in step 1 to review images and jokes here.</p>
          ) : rows.length === 0 && generatingCaptions ? (
            null
          ) : rows.length === 0 ? (
            <>
            {captionGenerationError ? <p role="alert" className="text-sm text-destructive">{captionGenerationError}</p> : null}
            <p className="py-8 text-center text-sm text-muted-foreground">No captions remain. <a href="/study-quick" className="underline underline-offset-4">Start a new Quick Study</a> to add captions.</p>
            </>
          ) : (
            <>
            {captionGenerationError ? <p role="alert" className="text-sm text-destructive">{captionGenerationError}</p> : null}
            {/* Saved captions remain usable while their image URLs are replaced. */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {rows.map((row, index) => {
                const isEditing = Object.prototype.hasOwnProperty.call(captionDrafts, row.key);
                const isSaving = savingCaptionKeys.has(row.key);
                const imagePreview = (
                  <div className="row-span-2 flex h-24 w-24 items-center justify-center overflow-hidden rounded border border-border/60 bg-muted/20">
                    {row.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.previewUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                    ) : <span className="text-center text-[10px] text-muted-foreground">No image</span>}
                  </div>
                );
                return (
                <CaptionPreview
                  key={row.key}
                  caption={isEditing ? captionDrafts[row.key] : row.caption}
                  imageUrl={row.previewUrl}
                  className="h-full rounded-md border border-border/60 bg-card p-2.5"
                >
                  <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
                    {imagePreview}
                    <div className="min-w-0">
                      <div className="relative">
                        {/* Keep the original text's dimensions while its input is open. */}
                        <p className={cn("whitespace-pre-wrap break-words text-lg leading-snug text-foreground", isEditing && "invisible")}>{row.caption}</p>
                        {isEditing ? (
                          <Input
                            type="text"
                            ref={focusCaptionInput}
                            value={captionDrafts[row.key]}
                            readOnly={isSaving}
                            onChange={(event) => setCaptionDrafts((current) => ({
                              ...current,
                              [row.key]: event.target.value,
                            }))}
                            onBlur={() => void handleSaveCaption(row)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.repeat) {
                                event.preventDefault();
                                void handleSaveCaption(row);
                              }
                            }}
                            className="pointer-events-auto absolute -left-px -top-px z-10 h-8 w-[calc(100%+2px)] px-0 py-0 text-lg leading-snug md:text-lg"
                            aria-label={`Edit caption ${index + 1}`}
                          />
                        ) : null}
                      </div>
                      {row.status === "error" ? (
                        <p className="mt-2 break-words text-xs text-destructive">{row.message ?? "Could not save this caption."}</p>
                      ) : null}
                    </div>
                    <div className="pointer-events-auto relative z-10 col-start-2 flex items-center justify-self-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 [&_svg]:size-3.5"
                      aria-label={isEditing ? `Save caption ${index + 1}` : `Edit caption ${index + 1}`}
                      title={isEditing ? "Save caption" : "Edit caption"}
                      disabled={row.status !== "complete" || !row.captionId || isSaving || deletingCaptionKey !== null || releasing}
                      onClick={() => isEditing ? void handleSaveCaption(row) : handleEditCaption(row)}
                    >
                      {isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive/80 [&_svg]:size-3.5"
                      aria-label={`Delete caption ${index + 1}`}
                      disabled={row.status !== "complete" || !row.captionId || isSaving || deletingCaptionKey !== null || releasing}
                      onClick={() => void handleDeleteCaption(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    </div>
                  </div>
                </CaptionPreview>
                );
              })}
            </div>
            </>
          )}
          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button
              type="button"
              size="lg"
              className="bg-red-600 px-10 text-white hover:bg-red-700"
              disabled={generatingCaptions || (!captionsStepComplete && !captionGenerationFailed)}
              onClick={() => captionGenerationFailed ? void handleGenerateCaptions() : handleCaptionsNext()}
            >
              {captionGenerationFailed ? "Retry" : "Next"}
            </Button>
          </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card
        ref={dedupeSectionRef}
        className={cn(
          "scroll-mt-6 shadow-sm transition-colors",
          choiceLocked && "border-muted bg-muted/30 opacity-50 grayscale"
        )}
      >
        <CardHeader>
          <CardTitle className="text-base">3. Caption similarity</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={choiceLocked || releasing} className="min-w-0 space-y-3">
          <div className="space-y-2">
            {rows.length > CAPTION_ARRAY_REVIEW_LIMIT ? <p className="text-sm text-amber-700 dark:text-amber-400">Optional review supports up to {CAPTION_ARRAY_REVIEW_LIMIT} captions. Remove captions in step 2 to enable it, or choose No to keep all captions.</p> : null}
            <div className="flex flex-col items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-3 text-left">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Review similar captions?</p>
                <p className="text-xs text-muted-foreground">Review groups here, or skip to keep every caption.</p>
              </div>
              <div className="flex flex-wrap justify-start gap-2">
                <Button
                  type="button"
                  size="sm"
                  aria-pressed={dedupeChoice === "yes"}
                  className={cn(
                    "h-8 text-xs",
                    dedupeChoice === "yes" && "shadow-lg ring-2 ring-foreground ring-offset-2"
                  )}
                  disabled={!captionsStepComplete || rows.length > CAPTION_ARRAY_REVIEW_LIMIT}
                  onClick={() => handleDedupeChoiceChange("yes")}
                >
                  Yes, review groups
                </Button>
                <Button
                  type="button"
                  size="sm"
                  aria-pressed={dedupeChoice === "no"}
                  className={cn(
                    "h-8 text-xs",
                    dedupeChoice === "no" && "shadow-lg ring-2 ring-foreground ring-offset-2"
                  )}
                  disabled={!captionsStepComplete}
                  onClick={() => handleDedupeChoiceChange("no")}
                >
                  No, keep all captions
                </Button>
              </div>
            </div>
          </div>
          {dedupeChoice === "no" ? (
            <>
              <p className="text-xs text-muted-foreground">All captions are included.</p>
              <div className="flex justify-end border-t border-border/60 pt-4">
                <Button
                  type="button"
                  size="lg"
                  className="bg-red-600 px-10 text-white hover:bg-red-700"
                  disabled={!canSaveStudy || releaseLocked || released}
                  onClick={() => void handleDedupeReviewNext()}
                >
                  Next
                </Button>
              </div>
            </>
          ) : null}
          </fieldset>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "shadow-sm transition-colors",
          groupReviewLocked && "border-muted bg-muted/30 opacity-50 grayscale"
        )}
      >
        <CardHeader>
          <CardTitle className="text-base">Review groups and choose captions (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={groupReviewLocked} className="min-w-0 space-y-3">
            {unlockedThroughStep >= QUICK_STUDY_STEP.deduplicate && dedupeChoice === "yes" ? (
              <CaptionArrayReview
                ref={dedupeReviewRef}
                items={reviewItems}
                selectedIds={selectedCaptionIds}
                loadingBlocked={!captionsStepComplete || savingCaptionKeys.size > 0 || deletingCaptionKey !== null}
                disabled={groupReviewLocked}
                onStatusChanged={handleDedupeStatusChanged}
                onSelectionChanged={setSelectedCaptionIds}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Choose Yes in step 3 to see groups of similar captions.</p>
            )}
          {dedupeChoice === "yes" ? (
            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button
                type="button"
                size="lg"
                className="bg-red-600 px-10 text-white hover:bg-red-700"
                disabled={!canSaveStudy || releaseLocked || released}
                onClick={() => void handleDedupeReviewNext()}
              >
                Next
              </Button>
            </div>
          ) : null}
          </fieldset>
        </CardContent>
      </Card>

      {/* ---- Name, schedule, publish ---- */}
      <Card
        ref={publishSectionRef}
        className={cn(
          "scroll-mt-6 shadow-sm transition-colors",
          publishLocked && "border-muted bg-muted/30 opacity-50 grayscale"
        )}
      >
        <CardHeader>
          <CardTitle className="text-base">4. Release study</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={publishLocked || releasing} className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label>Study name</Label>
            <Input
              value={studyName}
              onChange={(e) => setCustomStudyName(e.target.value)}
              disabled={!dedupeDecisionComplete || releaseUncertain}
            />
            <p className="text-xs text-muted-foreground">Study name defaults to MM-DD-captioncount-flavorname. You can edit it.</p>
            {normalizeSlug(studyName) && existingSlugs.has(normalizeSlug(studyName)) ? (
              <p className="text-xs text-amber-600">A study with this name exists; a suffix will be added.</p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={studyStart}
                disabled={!dedupeDecisionComplete || releaseUncertain}
                onChange={(e) => setStudyStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input
                type="datetime-local"
                value={studyEnd}
                disabled={!dedupeDecisionComplete || releaseUncertain}
                onChange={(e) => setStudyEnd(e.target.value)}
              />
            </div>
          </div>

          {!captionsStepComplete ? (
            <p className="text-sm text-muted-foreground">Complete the previous steps before publishing.</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            {createdStudy && !released ? (
              <Button variant="outline" asChild>
                <a
                  href={getStudySiteUrl(createdStudy.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  See private preview
                </a>
              </Button>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="lg"
                  className="bg-red-600 px-10 text-white hover:bg-red-700"
                  disabled={releasing || !canPublish}
                >
                  {releasing ? "Releasing study..." : released ? "Study released" : "Release Study"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100%-2rem)]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-3 text-2xl font-bold">
                    <AlertTriangle className="h-7 w-7 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    Are you sure?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xl leading-relaxed text-foreground">
                    Once released, this study will be available for all voters on humorstudy.org.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => void handleReleaseStudy()}
                    disabled={releasing || !canPublish}
                  >
                    Release Study
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="space-y-1">
              {!captionsStepComplete ? (
                <p className="text-xs text-muted-foreground">
                  Wait for captions to finish preparing before publishing.
                </p>
              ) : dedupeChoice === null ? (
                <p className="text-xs text-muted-foreground">
                  Choose whether to review similar captions in step 3.
                </p>
              ) : null}
              {!allCaptionsGenerated ? (
                <p className="text-xs text-muted-foreground">Every caption must be ready before publishing.</p>
              ) : null}
              {Object.keys(captionDrafts).length > 0 ? <p className="text-xs text-muted-foreground">Save caption edits in step 2 before releasing the study.</p> : null}
              {captionsStepComplete && includedItems.length === 0 ? <p className="text-xs text-destructive">Select at least one caption before releasing the study.</p> : null}
              {!validSchedule ? <p className="text-xs text-destructive">Choose valid start and end times, with the end after the start.</p> : null}
              {releaseUncertain ? <p role="alert" className="text-xs text-destructive">The release status could not be confirmed. Editing is paused; click Release Study again to verify and resume the same release.</p> : null}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {released && createdStudy ? (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-2xl font-semibold text-foreground">{createdStudy.is_private ? "Study released privately" : "Study released publicly"}</p>
          <p className="text-sm text-muted-foreground">
            {createdStudy.slug} {createdStudy.is_private ? "is private and not publicly available" : `is public on ${STUDY_SITE_HOST}`} with {activeCaptionCount} caption
            {activeCaptionCount === 1 ? "" : "s"}.
          </p>
          {createdStudy.is_private ? <Button asChild><a href={`/study/${createdStudy.id}`}>Manage private study</a></Button> : <div className="flex flex-col items-center gap-3 pt-2">
            <div className="flex items-center gap-1">
              <a
                href={getStudySiteUrl(createdStudy.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800"
              >
                {STUDY_SITE_HOST}/study/{createdStudy.id}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <CopyStudyLinkButton url={getStudySiteUrl(createdStudy.id)} />
            </div>
            <Button asChild>
              <a
                href={getStudySiteUrl(createdStudy.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Go to study
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
