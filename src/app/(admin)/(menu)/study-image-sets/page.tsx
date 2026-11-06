"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import type { StudyImageSet } from "@/types/study";
import { StudyImageSetsService } from "@/services/studies.service";
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

export default function StudyImageSetsPage() {
  const { toast } = useToast();
  const { timeZone } = useTimeZone();
  const router = useRouter();
  const [imageSets, setImageSets] = useState<StudyImageSet[]>([]);
  const [isLoadingImageSets, setIsLoadingImageSets] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingImageSet, setEditingImageSet] = useState<StudyImageSet | null>(null);
  const [deletingImageSet, setDeletingImageSet] = useState<StudyImageSet | null>(null);

  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isSavingImageSet, setIsSavingImageSet] = useState(false);

  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isUpdatingImageSet, setIsUpdatingImageSet] = useState(false);

  const loadImageSets = async () => {
    setIsLoadingImageSets(true);
    const data = await StudyImageSetsService.getAllImageSets();
    setImageSets(data);
    setIsLoadingImageSets(false);
  };

  useEffect(() => {
    void loadImageSets();
  }, []);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredImageSets = useMemo(() => {
    if (!normalizedSearch) return imageSets;
    return imageSets.filter((imageSet) => {
      return (
        String(imageSet.id).includes(normalizedSearch) ||
        imageSet.slug.toLowerCase().includes(normalizedSearch) ||
        (imageSet.description ?? "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [imageSets, normalizedSearch]);

  const resetNewForm = () => {
    setNewSlug("");
    setNewDescription("");
  };

  const handleCreateImageSet = async () => {
    if (!newSlug.trim()) {
      toast({
        title: "Missing slug",
        description: "Please provide a slug for this image set.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingImageSet(true);
    const created = await StudyImageSetsService.createImageSet({
      slug: newSlug.trim(),
      description: newDescription.trim() || null,
    });

    if (created) {
      toast({
        title: "Image set created",
        description: `Created ${getImageSetLabel(created)}.`,
      });
      resetNewForm();
      setIsCreateOpen(false);
      await loadImageSets();
    } else {
      toast({
        title: "Failed to create image set",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    setIsSavingImageSet(false);
  };

  const openEditImageSet = (imageSet: StudyImageSet) => {
    setEditingImageSet(imageSet);
    setEditSlug(imageSet.slug ?? "");
    setEditDescription(imageSet.description ?? "");
  };

  const handleUpdateImageSet = async () => {
    if (!editingImageSet) return;
    if (!editSlug.trim()) {
      toast({
        title: "Missing slug",
        description: "Please provide a slug for this image set.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingImageSet(true);
    const updated = await StudyImageSetsService.updateImageSet(editingImageSet.id, {
      slug: editSlug.trim(),
      description: editDescription.trim() || null,
    });

    if (updated) {
      toast({
        title: "Image set updated",
        description: `Updated ${getImageSetLabel(updated)}.`,
      });
      setEditingImageSet(null);
      await loadImageSets();
    } else {
      toast({
        title: "Failed to update image set",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    setIsUpdatingImageSet(false);
  };

  const handleDeleteImageSet = async () => {
    if (!deletingImageSet) return;
    const success = await StudyImageSetsService.deleteImageSet(deletingImageSet.id);
    if (success) {
      toast({
        title: "Image set deleted",
        description: `${getImageSetLabel(deletingImageSet)} removed.`,
      });
      setDeletingImageSet(null);
      await loadImageSets();
    } else {
      toast({
        title: "Failed to delete image set",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Image Sets</h1>
          <p className="page-subtitle">
            Curate reusable image groups for humor flavor testing.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Image Set
        </Button>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search image sets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Badge variant="secondary" className="font-sans">
              {filteredImageSets.length} total
            </Badge>
          </div>

          <div className="table-shell">
            <div className="overflow-x-auto">
              <table className="min-w-full table-base">
                <thead className="table-head">
                  <tr>
                    <th>Id</th>
                    <th>Slug</th>
                    <th>Description</th>
                    <th>Created</th>
                    <th>Updated</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {isLoadingImageSets ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Loading image sets...
                        </p>
                      </td>
                    </tr>
                  ) : filteredImageSets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No image sets found.
                      </td>
                    </tr>
                  ) : (
                    filteredImageSets.map((imageSet) => (
                      <tr
                        key={imageSet.id}
                        className="hover:bg-muted/50 transition-colors animate-in fade-in-0 cursor-pointer"
                        onClick={() => router.push(`/study-image-set/${imageSet.id}`)}
                      >
                        <td className="font-sans text-muted-foreground">
                          {imageSet.id}
                        </td>
                        <td className="font-medium">{imageSet.slug}</td>
                        <td className="text-muted-foreground max-w-[260px] truncate">
                          {imageSet.description || "-"}
                        </td>
                        <td className="text-muted-foreground">
                          {formatDateTime(imageSet.created_datetime_utc, timeZone)}
                        </td>
                        <td className="text-muted-foreground">
                          {formatDateTime(imageSet.modified_datetime_utc, timeZone)}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditImageSet(imageSet);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeletingImageSet(imageSet);
                              }}
                              className="text-destructive hover:text-destructive/80"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetNewForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Image Set</DialogTitle>
            <DialogDescription>
              Create a new image set for humor flavor testing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                placeholder="e.g., dorm-life"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional context for this image set..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="min-h-[90px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateImageSet} disabled={isSavingImageSet}>
              {isSavingImageSet ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Image Set"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingImageSet}
        onOpenChange={(open) => {
          if (!open) setEditingImageSet(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Image Set</DialogTitle>
            <DialogDescription>
              Update the slug or description for this image set.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional context for this image set..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="min-h-[90px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingImageSet(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateImageSet} disabled={isUpdatingImageSet}>
              {isUpdatingImageSet ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingImageSet}
        onOpenChange={(open) => {
          if (!open) setDeletingImageSet(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image set?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingImageSet ? getImageSetLabel(deletingImageSet) : "this image set"}?
              This removes the image set and any related mappings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteImageSet}
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
