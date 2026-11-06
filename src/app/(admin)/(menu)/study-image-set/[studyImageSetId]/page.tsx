"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Search,
  Trash2,
  ExternalLink,
  LayoutGrid,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { isUUID } from "@/utils/utils";
import type {
  StudyImageSet,
  StudyImageSetImageMappingWithDetails,
} from "@/types/study";
import {
  StudyImageSetImageMappingsService,
  StudyImageSetsService,
} from "@/services/studies.service";
import { useTimeZone } from "@/components/TimeZoneContext";

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

const getImageSetLabel = (imageSet: StudyImageSet) =>
  imageSet.slug?.trim() ? imageSet.slug : `Image Set ${imageSet.id}`;

const parseImageSetId = (value: unknown) => {
  const parsed = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const THUMBNAIL_SIZES = [320, 480, 640, 750] as const;
const MEDIUM_THUMBNAIL_SIZE = 640;

const getThumbnailInfo = (url: string | null | undefined) => {
  if (!url) return { src: null, srcSet: undefined };
  const match = url.match(
    /^(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/\?]+)\.([^\/\?\s]+)(\?.*)?$/
  );
  if (!match) return { src: url, srcSet: undefined };

  const [, baseUrl, userId, imageId, extension, query = ""] = match;
  const basePath = `${baseUrl}/${userId}/${imageId}`;
  const src = `${basePath}-${MEDIUM_THUMBNAIL_SIZE}.${extension}${query}`;
  const srcSet = THUMBNAIL_SIZES.map(
    (size) => `${basePath}-${size}.${extension}${query} ${size}w`
  ).join(", ");

  return { src, srcSet };
};

export default function StudyImageSetDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { timeZone } = useTimeZone();

  const imageSetId = useMemo(() => {
    const raw = params?.studyImageSetId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const paramId = parseImageSetId(value);
    if (paramId != null) return paramId;
    if (!pathname) return null;
    const match = pathname.match(/\/study-image-set\/([^/]+)/);
    if (!match) return null;
    return parseImageSetId(match[1]);
  }, [params, pathname]);

  const [imageSet, setImageSet] = useState<StudyImageSet | null>(null);
  const [isLoadingImageSet, setIsLoadingImageSet] = useState(true);
  const [mappings, setMappings] = useState<StudyImageSetImageMappingWithDetails[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(true);
  const [mappingSearch, setMappingSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [newImageId, setNewImageId] = useState("");
  const [isCreatingMapping, setIsCreatingMapping] = useState(false);

  const [editingMapping, setEditingMapping] =
    useState<StudyImageSetImageMappingWithDetails | null>(null);
  const [editImageId, setEditImageId] = useState("");
  const [isUpdatingMapping, setIsUpdatingMapping] = useState(false);
  const [deletingMapping, setDeletingMapping] =
    useState<StudyImageSetImageMappingWithDetails | null>(null);

  useEffect(() => {
    let active = true;
    if (imageSetId == null) {
      setImageSet(null);
      setIsLoadingImageSet(false);
      return;
    }

    const loadImageSet = async () => {
      setIsLoadingImageSet(true);
      const data = await StudyImageSetsService.getImageSetById(imageSetId);
      if (!active) return;
      setImageSet(data);
      setIsLoadingImageSet(false);
      if (!data) {
        toast({
          title: "Image set not found",
          description: "We couldn't find details for this image set.",
          variant: "destructive",
        });
      }
    };

    void loadImageSet();
    return () => {
      active = false;
    };
  }, [imageSetId, toast]);

  const loadMappings = async (setId: number) => {
    setIsLoadingMappings(true);
    const data = await StudyImageSetImageMappingsService.getMappingsByImageSetId(setId);
    setMappings(data);
    setIsLoadingMappings(false);
  };

  useEffect(() => {
    let active = true;
    if (imageSetId == null) {
      setMappings([]);
      setIsLoadingMappings(false);
      return;
    }

    const fetchMappings = async () => {
      setIsLoadingMappings(true);
      const data = await StudyImageSetImageMappingsService.getMappingsByImageSetId(imageSetId);
      if (!active) return;
      setMappings(data);
      setIsLoadingMappings(false);
    };

    void fetchMappings();
    return () => {
      active = false;
    };
  }, [imageSetId]);

  const normalizedSearch = mappingSearch.trim().toLowerCase();
  const filteredMappings = useMemo(() => {
    if (!normalizedSearch) return mappings;
    return mappings.filter((mapping) => {
      const imageDetails = [
        mapping.images?.additional_context,
        mapping.images?.image_description,
        mapping.images?.celebrity_recognition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        String(mapping.id).includes(normalizedSearch) ||
        imageDetails.includes(normalizedSearch)
      );
    });
  }, [mappings, normalizedSearch]);

  const resetNewMappingForm = () => {
    setNewImageId("");
  };

  const handleCreateMapping = async () => {
    if (imageSetId == null) return;
    const trimmedImageId = newImageId.trim();
    if (!isUUID(trimmedImageId)) {
      toast({
        title: "Invalid image ID",
        description: "Please enter a valid image UUID.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingMapping(true);
    const created = await StudyImageSetImageMappingsService.createMapping({
      study_image_set_id: imageSetId,
      image_id: trimmedImageId,
    });

    if (created) {
      toast({
        title: "Image added",
        description: "Image mapped to this set.",
      });
      resetNewMappingForm();
      await loadMappings(imageSetId);
    } else {
      toast({
        title: "Failed to add image",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    setIsCreatingMapping(false);
  };

  const handleUpdateMapping = async () => {
    if (!editingMapping || imageSetId == null) return;

    const trimmedImageId = editImageId.trim();
    if (!isUUID(trimmedImageId)) {
      toast({
        title: "Invalid image ID",
        description: "Please enter a valid image UUID.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingMapping(true);
    const updated = await StudyImageSetImageMappingsService.updateMapping(
      editingMapping.id,
      {
        image_id: trimmedImageId,
      }
    );

    if (updated) {
      toast({
        title: "Mapping updated",
        description: "Image mapping updated successfully.",
      });
      setEditingMapping(null);
      await loadMappings(imageSetId);
    } else {
      toast({
        title: "Failed to update mapping",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    setIsUpdatingMapping(false);
  };

  const handleDeleteMapping = async () => {
    if (!deletingMapping || imageSetId == null) return;
    const success = await StudyImageSetImageMappingsService.deleteMapping(
      deletingMapping.id
    );
    if (success) {
      toast({
        title: "Mapping deleted",
        description: "Image removed from this set.",
      });
      setDeletingMapping(null);
      await loadMappings(imageSetId);
    } else {
      toast({
        title: "Failed to delete mapping",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Image Set</h1>
          <p className="page-subtitle">
            Manage the images assigned to this set.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/study-image-sets")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Image Sets
        </Button>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Image Set Details</CardTitle>
              <CardDescription>Slug, description, and timestamps.</CardDescription>
            </div>
            <Badge variant="secondary" className="font-sans">
              {imageSet ? getImageSetLabel(imageSet) : "Image Set"}
            </Badge>
          </div>
          {isLoadingImageSet ? (
            <div className="py-10 text-center">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading image set...</p>
            </div>
          ) : !imageSet ? (
            <div className="py-6 text-sm text-muted-foreground">
              No image set details available for this id.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Id
                </p>
                <p className="font-sans font-medium">{imageSet.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Slug
                </p>
                <p className="font-medium">{imageSet.slug}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <p className="text-muted-foreground">
                  {imageSet.description || "-"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Created
                </p>
                <p className="text-muted-foreground">
                  {formatDateTime(imageSet.created_datetime_utc, timeZone)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Updated
                </p>
                <p className="text-muted-foreground">
                  {formatDateTime(imageSet.modified_datetime_utc, timeZone)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-3">
        <CardContent className="p-4 space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 animate-in fade-in-0">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label>Image ID</Label>
                <Input
                  placeholder="Paste image UUID"
                  value={newImageId}
                  onChange={(e) => setNewImageId(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleCreateMapping}
                  disabled={
                    isCreatingMapping ||
                    imageSetId == null ||
                    !newImageId.trim()
                  }
                >
                  {isCreatingMapping ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Adding...
                    </span>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Image
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={resetNewMappingForm}
                  disabled={!newImageId}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search images in this set..."
                value={mappingSearch}
                onChange={(e) => setMappingSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-sans">
                {filteredMappings.length} images
              </Badge>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                >
                  <List className="h-4 w-4" />
                  List
                </Button>
              </div>
            </div>
          </div>

          <div className="table-shell">
            {isLoadingMappings ? (
              <div className="py-10 text-center">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Loading image mappings...
                </p>
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No images mapped to this set yet.
              </div>
            ) : viewMode === "grid" ? (
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredMappings.map((mapping) => {
                    const description = mapping.images?.image_description || "—";
                    const celebrityContext =
                      mapping.images?.celebrity_recognition || "—";
                    const additionalContext =
                      mapping.images?.additional_context || "—";
                    const thumbnail = getThumbnailInfo(mapping.images?.url);

                  return (
                      <div
                        key={mapping.id}
                        className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm hover:shadow-md transition-shadow animate-in fade-in-0"
                      >
                        <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20 aspect-[4/3]">
                          {thumbnail.src ? (
                            <img
                              src={thumbnail.src}
                              srcSet={thumbnail.srcSet}
                              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                              alt="Image thumbnail"
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              No image preview
                            </div>
                          )}
                          <Badge
                            variant="secondary"
                            className="absolute left-2 top-2 text-[11px] font-sans"
                          >
                            Id {mapping.id}
                          </Badge>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Image Description
                          </p>
                          <p className="text-sm font-medium text-foreground line-clamp-2">
                            {description}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Celebrity Context
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {celebrityContext}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Additional Context
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {additionalContext}
                          </p>
                        </div>
                      </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(mapping.created_datetime_utc, timeZone)}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link
                                href={`/image/${mapping.image_id}`}
                                aria-label="View image"
                                title="View image"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingMapping(mapping)}
                              className="text-destructive hover:text-destructive/80"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-base">
                  <thead className="table-head">
                    <tr>
                      <th>Id</th>
                      <th>Image</th>
                      <th>Created</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {filteredMappings.map((mapping) => {
                      const thumbnail = getThumbnailInfo(mapping.images?.url);

                      return (
                        <tr
                          key={mapping.id}
                          className="hover:bg-muted/50 transition-colors animate-in fade-in-0"
                        >
                          <td className="font-sans text-muted-foreground">
                            {mapping.id}
                          </td>
                          <td>
                            <div className="flex gap-3">
                              <div className="mt-1 h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/20">
                                {thumbnail.src ? (
                                  <img
                                    src={thumbnail.src}
                                    srcSet={thumbnail.srcSet}
                                    sizes="40px"
                                    alt="Image thumbnail"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="h-full w-full bg-muted/30" />
                                )}
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Image Description
                                  </p>
                                  <p className="text-sm text-foreground line-clamp-2">
                                    {mapping.images?.image_description || "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Celebrity Context
                                  </p>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {mapping.images?.celebrity_recognition || "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Additional Context
                                  </p>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {mapping.images?.additional_context || "—"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="text-muted-foreground">
                            {formatDateTime(mapping.created_datetime_utc, timeZone)}
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="icon" asChild>
                                <Link
                                  href={`/image/${mapping.image_id}`}
                                  aria-label="View image"
                                  title="View image"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingMapping(mapping)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!editingMapping}
        onOpenChange={(open) => {
          if (!open) setEditingMapping(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Image Mapping</DialogTitle>
            <DialogDescription>
              Update the image ID assigned to this mapping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Image ID</Label>
              <Input
                value={editImageId}
                onChange={(e) => setEditImageId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingMapping(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateMapping} disabled={isUpdatingMapping}>
              {isUpdatingMapping ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Mapping"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingMapping}
        onOpenChange={(open) => {
          if (!open) setDeletingMapping(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this image from the set? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMapping}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
