"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ImageIcon, RotateCw, Text } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import CaptionReviewGroups from "@/components/study/CaptionReviewGroups";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildDedupeGroups,
  getDescriptiveBucketName,
  hydrateDedupeResult,
  requestBucketNames,
  requestCaptionDedupe,
  selectDedupeMethodResult,
  type DedupeReviewGroup,
} from "@/services/dedupe.service";
import { StudyCaptionMappingsService } from "@/services/studies.service";
import type { DedupeBucket, DedupeCaptionsResponse } from "@/types/dedupe";
import type { StudyCaptionMappingWithCaptionDetails } from "@/types/study";
import {
  getDedupeScopeKey,
  type DedupeLoadStatus,
} from "@/utils/study-dedupe";

const APPLY_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
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

type DedupeReviewProps = {
  studyId: number | null;
  mappings: StudyCaptionMappingWithCaptionDetails[];
  loadingBlocked?: boolean;
  loadingBlockedMessage?: string;
  showSaveButton?: boolean;
  onMappingsChanged?: (remainingMappings: StudyCaptionMappingWithCaptionDetails[]) => void;
  onPendingChangesChanged?: (hasPendingChanges: boolean) => void;
  onStatusChanged?: (status: DedupeLoadStatus) => void;
  onSelectionChanged?: (mappingIds: number[]) => void;
  onSaved: (remainingMappings: StudyCaptionMappingWithCaptionDetails[]) => void;
};

export type DedupeReviewHandle = {
  save: () => Promise<boolean>;
  cancel: () => void;
};

const DedupeReview = forwardRef<DedupeReviewHandle, DedupeReviewProps>(function DedupeReview(
  {
    studyId,
    mappings,
    loadingBlocked = false,
    loadingBlockedMessage = "Deduplication will run when caption generation finishes.",
    showSaveButton = false,
    onMappingsChanged,
    onPendingChangesChanged,
    onStatusChanged,
    onSelectionChanged,
    onSaved,
  },
  ref
) {
  const { toast } = useToast();
  const [result, setResult] = useState<DedupeCaptionsResponse | null>(null);
  const [bucketNames, setBucketNames] = useState<Record<string, string>>({});
  const [selectedMappingIds, setSelectedMappingIds] = useState<Set<number>>(
    () => new Set(mappings.map((mapping) => mapping.id))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [, setIsNaming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"images" | "captions">("images");
  const [loadStatus, setLoadStatus] = useState<DedupeLoadStatus>("waiting");

  const mappingKey = useMemo(() => getDedupeScopeKey(mappings), [mappings]);
  const loadScope = `${loadingBlocked ? "blocked" : "ready"}:${studyId ?? "none"}:${mappingKey}`;
  const latestLoadScopeRef = useRef(loadScope);
  const loadRequestIdRef = useRef(0);
  const loadAbortControllerRef = useRef<AbortController | null>(null);
  const savedRef = useRef(false);
  latestLoadScopeRef.current = loadScope;

  const loadDedupe = async (force = false) => {
    if (savedRef.current && !force) return;
    if (force) savedRef.current = false;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const requestScope = loadScope;
    const isCurrentRequest = () =>
      loadRequestIdRef.current === requestId && latestLoadScopeRef.current === requestScope;

    setResult(null);
    setBucketNames({});
    setError(null);
    setIsNaming(false);
    setIsLoading(false);
    setSelectedMappingIds(new Set(mappings.map((mapping) => mapping.id)));

    if (loadingBlocked || !studyId) {
      setLoadStatus("waiting");
      return;
    }
    if (mappings.length < 2) {
      setLoadStatus("ready");
      return;
    }

    setIsLoading(true);
    setLoadStatus("loading");
    loadAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    loadAbortControllerRef.current = abortController;
    try {
      const rawDedupeResult = await requestCaptionDedupe(studyId, abortController.signal);
      if (!isCurrentRequest()) return;

      const dedupeResult = hydrateDedupeResult(rawDedupeResult, mappings);
      setResult(dedupeResult);
      setLoadStatus("ready");

      const method = selectDedupeMethodResult(dedupeResult);
      const bucketsNeedingNames = method.buckets.filter((bucket) => !hasBucketName(bucket));
      if (bucketsNeedingNames.length > 0) {
        setIsNaming(true);
        try {
          const names = await requestBucketNames(bucketsNeedingNames);
          if (!isCurrentRequest()) return;
          setBucketNames(names);
        } catch (nameError) {
          if (!isCurrentRequest()) return;
          toast({
            title: "Bucket names unavailable",
            description:
              nameError instanceof Error
                ? nameError.message
                : "Using the bucket labels returned by dedupe.",
            variant: "destructive",
          });
        } finally {
          if (isCurrentRequest()) setIsNaming(false);
        }
      }
      if (isCurrentRequest()) setLoadStatus("ready");
    } catch (dedupeError) {
      if (!isCurrentRequest()) return;
      const message =
        dedupeError instanceof Error ? dedupeError.message : "Failed to build dedupe buckets.";
      setError(message);
      setLoadStatus("error");
      toast({
        title: "Failed to build dedupe buckets",
        description: "Retry deduplication to load the review.",
        variant: "destructive",
      });
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
        loadAbortControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!savedRef.current) void loadDedupe();
    return () => {
      loadRequestIdRef.current += 1;
      loadAbortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, mappingKey, loadingBlocked]);

  useEffect(() => {
    onStatusChanged?.(loadStatus);
  }, [loadStatus, onStatusChanged]);

  const method = result ? selectDedupeMethodResult(result) : null;
  const groups = useMemo<DedupeReviewGroup[]>(
    () => (method ? buildDedupeGroups(method, mappings, bucketNames) : []),
    [method, mappings, bucketNames]
  );
  const selectedCount = mappings.filter((mapping) => selectedMappingIds.has(mapping.id)).length;
  const removedCount = Math.max(mappings.length - selectedCount, 0);

  useEffect(() => {
    onSelectionChanged?.(mappings.filter((mapping) => selectedMappingIds.has(mapping.id)).map((mapping) => mapping.id));
  }, [mappings, selectedMappingIds, onSelectionChanged]);

  useEffect(() => {
    onPendingChangesChanged?.(removedCount > 0);
  }, [onPendingChangesChanged, removedCount]);

  const introduction = (
    <div className="space-y-2">
      <p className="text-xl font-semibold leading-relaxed text-foreground">
        All captions are included by default. You choose what to remove.
      </p>
      <p className="text-sm text-muted-foreground">
        Grouping does not remove any captions automatically.
      </p>
      <p className="text-sm font-semibold text-foreground">
        {selectedCount}/{mappings.length} captions included in study
      </p>
    </div>
  );

  const toggleMapping = (mappingId: number) => {
    if (isApplying) return;
    savedRef.current = false;
    setSelectedMappingIds((previous) => {
      const next = new Set(previous);
      if (next.has(mappingId)) next.delete(mappingId);
      else next.add(mappingId);
      return next;
    });
  };

  const setGroupSelection = (ids: string[], included: boolean) => {
    if (isApplying || loadingBlocked) return;
    savedRef.current = false;
    setSelectedMappingIds((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (included) next.add(Number(id));
        else next.delete(Number(id));
      }
      return next;
    });
  };

  const revertAll = () => {
    savedRef.current = false;
    setSelectedMappingIds(new Set(mappings.map((mapping) => mapping.id)));
  };

  const saveDedupe = async (showToast: boolean): Promise<boolean> => {
    if (savedRef.current) return true;
    if (isApplying || loadingBlocked || loadStatus !== "ready") return false;
    const removedMappings = mappings.filter((mapping) => !selectedMappingIds.has(mapping.id));
    if (removedMappings.length === 0) {
      savedRef.current = true;
      if (showToast) {
        toast({ title: "Deduplication saved", description: "All captions kept." });
      }
      onSaved(mappings);
      return true;
    }

    setIsApplying(true);
    const results = await mapWithConcurrency(removedMappings, APPLY_CONCURRENCY, async (mapping) => ({
      mappingId: mapping.id,
      success: await StudyCaptionMappingsService.deleteMapping(mapping.id),
    }));
    setIsApplying(false);

    const failedCount = results.filter((item) => !item.success).length;
    const removedIds = new Set(
      results.filter((item) => item.success).map((item) => item.mappingId)
    );
    const remaining = mappings.filter((mapping) => !removedIds.has(mapping.id));
    setSelectedMappingIds(new Set(remaining.map((mapping) => mapping.id)));

    if (failedCount > 0) {
      toast({
        title: "Some captions could not be removed",
        description: `Removed ${removedIds.size} of ${removedMappings.length} caption${removedMappings.length === 1 ? "" : "s"}.`,
        variant: "destructive",
      });
      if (removedIds.size > 0) onMappingsChanged?.(remaining);
      return false;
    }

    savedRef.current = true;
    if (showToast) {
      toast({
        title: "Deduplication saved",
        description: `Removed ${removedIds.size} caption${removedIds.size === 1 ? "" : "s"} from the study.`,
      });
    }
    onSaved(remaining);
    return true;
  };

  useImperativeHandle(ref, () => ({
    save: () => saveDedupe(false),
    cancel: () => {
      loadRequestIdRef.current += 1;
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = null;
      setIsLoading(false);
      setIsNaming(false);
      setLoadStatus("waiting");
    },
  }));

  const saveButton =
    showSaveButton && loadStatus === "ready" ? (
      <div className="flex justify-center border-t border-border/60 pt-6">
        <Button
          type="button"
          size="lg"
          className="w-full bg-gray-700 px-10 text-white hover:bg-gray-800 sm:w-auto"
          onClick={() => void saveDedupe(true)}
          disabled={isApplying}
        >
          {isApplying ? "Saving deduplication..." : "Save deduplication"}
        </Button>
      </div>
    ) : null;

  if (loadingBlocked) {
    return (
      <div className="space-y-4">
        {introduction}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {loadingBlockedMessage}
          </div>
        </div>
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="space-y-4">
        {introduction}
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            There are no captions to compare.
          </p>
        </div>
        {saveButton}
      </div>
    );
  }

  if (mappings.length < 2) {
    return (
      <div className="space-y-4">
        {introduction}
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Deduplication needs at least two captions.
          </p>
        </div>
        {saveButton}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {introduction}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value === "images" || value === "captions") setViewMode(value);
            }}
            variant="outline"
            size="sm"
            className="rounded-md border border-border/60 p-0.5"
          >
            <ToggleGroupItem value="images" aria-label="Show images and captions">
              <ImageIcon className="mr-1.5 h-4 w-4" />
              Images
            </ToggleGroupItem>
            <ToggleGroupItem value="captions" aria-label="Show captions only">
              <Text className="mr-1.5 h-4 w-4" />
              Captions only
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadDedupe(true)}
            disabled={loadingBlocked || isLoading || isApplying}
          >
            <RotateCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Retry
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={revertAll}
            disabled={isApplying || removedCount === 0}
          >
            Revert all changes
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Building dedupe buckets...
          </div>
        </div>
      ) : groups.length > 0 ? (
        <CaptionReviewGroups
          groups={groups.map(group => ({ ...group, captions: group.captions.map(caption => ({ ...caption, id: String(caption.mappingId) })) }))}
          selectedIds={new Set([...selectedMappingIds].map(String))}
          onToggle={id => toggleMapping(Number(id))}
          onGroupSelectionChange={setGroupSelection}
          viewMode={viewMode}
          disabled={isApplying}
        />
      ) : (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Dedupe buckets are unavailable. Retry deduplication to continue.
        </div>
      )}
      {saveButton}
    </div>
  );
});

export default DedupeReview;

function hasBucketName(bucket: DedupeBucket) {
  return Boolean(getDescriptiveBucketName(bucket));
}
