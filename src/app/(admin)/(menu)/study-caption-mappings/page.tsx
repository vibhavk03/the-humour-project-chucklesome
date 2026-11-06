"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isUUID } from "@/utils/utils";
import type { Study, StudyCaptionMappingWithDetails } from "@/types/study";
import {
  StudiesService,
  StudyCaptionMappingsService,
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

const getStudyLabel = (study: Study) =>
  study.slug?.trim() ? study.slug : `Study ${study.id}`;

const ITEMS_PER_PAGE = 25;

export default function StudyCaptionMappingsPage() {
  const { toast } = useToast();
  const { timeZone } = useTimeZone();
  const [studies, setStudies] = useState<Study[]>([]);
  const [mappings, setMappings] = useState<StudyCaptionMappingWithDetails[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(true);
  const [mappingSearch, setMappingSearch] = useState("");
  const [mappingStudyFilter, setMappingStudyFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [newMappingStudyId, setNewMappingStudyId] = useState("");
  const [newMappingCaptionId, setNewMappingCaptionId] = useState("");
  const [isCreatingMapping, setIsCreatingMapping] = useState(false);

  const [editingMapping, setEditingMapping] =
    useState<StudyCaptionMappingWithDetails | null>(null);
  const [editMappingStudyId, setEditMappingStudyId] = useState("");
  const [editMappingCaptionId, setEditMappingCaptionId] = useState("");
  const [isUpdatingMapping, setIsUpdatingMapping] = useState(false);
  const [deletingMapping, setDeletingMapping] =
    useState<StudyCaptionMappingWithDetails | null>(null);

  const loadStudies = async () => {
    const data = await StudiesService.getAllStudies();
    setStudies(data);
  };

  const loadMappings = async () => {
    setIsLoadingMappings(true);
    const data = await StudyCaptionMappingsService.getAllMappings();
    setMappings(data);
    setIsLoadingMappings(false);
  };

  useEffect(() => {
    void loadStudies();
    void loadMappings();
  }, []);

  const sortedStudies = useMemo(() => {
    return [...studies].sort((a, b) =>
      getStudyLabel(a).localeCompare(getStudyLabel(b))
    );
  }, [studies]);

  const normalizedMappingSearch = mappingSearch.trim().toLowerCase();
  const filteredMappings = useMemo(() => {
    return mappings.filter((mapping) => {
      if (mappingStudyFilter !== "all") {
        const filterId = Number(mappingStudyFilter);
        if (Number.isNaN(filterId) || mapping.study_id !== filterId) {
          return false;
        }
      }

      if (!normalizedMappingSearch) return true;

      const captionId = mapping.caption_id.toLowerCase();
      const captionContent = mapping.captions?.content?.toLowerCase() ?? "";
      const studyLabel = mapping.studies?.slug?.toLowerCase() ?? "";
      return (
        String(mapping.id).includes(normalizedMappingSearch) ||
        captionId.includes(normalizedMappingSearch) ||
        captionContent.includes(normalizedMappingSearch) ||
        studyLabel.includes(normalizedMappingSearch)
      );
    });
  }, [mappings, mappingStudyFilter, normalizedMappingSearch]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredMappings.length / ITEMS_PER_PAGE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const pageStart =
    filteredMappings.length === 0
      ? 0
      : (safePage - 1) * ITEMS_PER_PAGE + 1;
  const pageEnd = Math.min(filteredMappings.length, safePage * ITEMS_PER_PAGE);
  const paginatedMappings = filteredMappings.slice(pageStart - 1, pageEnd);
  const showPagination = filteredMappings.length > ITEMS_PER_PAGE;

  const mappingFilterLabel = useMemo(() => {
    if (mappingStudyFilter === "all") return "All studies";
    const studyId = Number(mappingStudyFilter);
    const match = studies.find((study) => study.id === studyId);
    return match ? getStudyLabel(match) : `Study ${mappingStudyFilter}`;
  }, [mappingStudyFilter, studies]);

  useEffect(() => {
    setCurrentPage(1);
  }, [mappingStudyFilter, normalizedMappingSearch]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const resetNewMappingForm = () => {
    setNewMappingCaptionId("");
  };

  const handleCreateMapping = async () => {
    if (!newMappingStudyId) {
      toast({
        title: "Select a study",
        description: "Choose the study to associate this caption with.",
        variant: "destructive",
      });
      return;
    }

    const trimmedCaptionId = newMappingCaptionId.trim();
    if (!isUUID(trimmedCaptionId)) {
      toast({
        title: "Invalid caption ID",
        description: "Please enter a valid caption UUID.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingMapping(true);
    const created = await StudyCaptionMappingsService.createMapping({
      study_id: Number(newMappingStudyId),
      caption_id: trimmedCaptionId,
    });

    if (created) {
      toast({
        title: "Mapping created",
        description: "Caption added to study.",
      });
      resetNewMappingForm();
      await loadMappings();
    } else {
      toast({
        title: "Failed to create mapping",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    setIsCreatingMapping(false);
  };

  const openEditMapping = (mapping: StudyCaptionMappingWithDetails) => {
    setEditingMapping(mapping);
    setEditMappingStudyId(mapping.study_id.toString());
    setEditMappingCaptionId(mapping.caption_id);
  };

  const handleUpdateMapping = async () => {
    if (!editingMapping) return;

    if (!editMappingStudyId) {
      toast({
        title: "Select a study",
        description: "Choose the study for this mapping.",
        variant: "destructive",
      });
      return;
    }

    const trimmedCaptionId = editMappingCaptionId.trim();
    if (!isUUID(trimmedCaptionId)) {
      toast({
        title: "Invalid caption ID",
        description: "Please enter a valid caption UUID.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingMapping(true);
    const updated = await StudyCaptionMappingsService.updateMapping(
      editingMapping.id,
      {
        study_id: Number(editMappingStudyId),
        caption_id: trimmedCaptionId,
      }
    );

    if (updated) {
      toast({
        title: "Mapping updated",
        description: "Caption mapping updated successfully.",
      });
      setEditingMapping(null);
      await loadMappings();
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
    if (!deletingMapping) return;
    const success = await StudyCaptionMappingsService.deleteMapping(
      deletingMapping.id
    );
    if (success) {
      toast({
        title: "Mapping deleted",
        description: "Caption mapping removed.",
      });
      setDeletingMapping(null);
      await loadMappings();
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
      <div className="page-header">
        <h1 className="page-title">Caption Mappings</h1>
        <p className="page-subtitle">
          Link captions to the studies they belong to.
        </p>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 animate-in fade-in-0">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label>Study</Label>
                <Select
                  value={newMappingStudyId}
                  onValueChange={setNewMappingStudyId}
                  disabled={sortedStudies.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        sortedStudies.length === 0
                          ? "Create a study first"
                          : "Select study"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedStudies.map((study) => (
                      <SelectItem key={study.id} value={study.id.toString()}>
                        {getStudyLabel(study)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Caption ID</Label>
                <Input
                  placeholder="Paste caption UUID"
                  value={newMappingCaptionId}
                  onChange={(e) => setNewMappingCaptionId(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleCreateMapping}
                  disabled={
                    isCreatingMapping ||
                    !newMappingStudyId ||
                    !newMappingCaptionId.trim()
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
                      Add Mapping
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={resetNewMappingForm}
                  disabled={!newMappingCaptionId}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
              <div className="w-full md:w-56">
                <Select
                  value={mappingStudyFilter}
                  onValueChange={setMappingStudyFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by study" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All studies</SelectItem>
                    {sortedStudies.map((study) => (
                      <SelectItem key={study.id} value={study.id.toString()}>
                        {getStudyLabel(study)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by caption, study, or ID..."
                  value={mappingSearch}
                  onChange={(e) => setMappingSearch(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-sans">
                {mappingFilterLabel}
              </Badge>
              <Badge variant="secondary" className="font-sans">
                {filteredMappings.length} mappings
              </Badge>
            </div>
          </div>

          <div className="table-shell">
            <div className="overflow-x-auto">
              <table className="min-w-full table-base">
                <thead className="table-head">
                  <tr>
                    <th>Id</th>
                    <th>Study</th>
                    <th>Caption</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {isLoadingMappings ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Loading mappings...
                        </p>
                      </td>
                    </tr>
                  ) : filteredMappings.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No caption mappings found.
                      </td>
                    </tr>
                  ) : (
                    paginatedMappings.map((mapping) => (
                      <tr
                        key={mapping.id}
                        className="hover:bg-muted/50 transition-colors animate-in fade-in-0"
                      >
                        <td className="font-sans text-muted-foreground">
                          {mapping.id}
                        </td>
                        <td className="font-medium">
                          {mapping.studies?.slug ||
                            `Study ${mapping.study_id}`}
                        </td>
                        <td>
                          <div className="space-y-1">
                            <div className="font-sans text-xs text-muted-foreground break-all">
                              {mapping.caption_id}
                            </div>
                            <div className="text-sm text-foreground max-w-[360px] truncate">
                              {mapping.captions?.content || "No caption content"}
                            </div>
                          </div>
                        </td>
                        <td className="text-muted-foreground">
                          {formatDateTime(mapping.created_datetime_utc, timeZone)}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditMapping(mapping)}
                            >
                              <Pencil className="h-4 w-4" />
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {showPagination && (
            <div className="mt-4 flex flex-col items-center justify-between gap-2 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {filteredMappings.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage === 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={safePage === totalPages}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
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
            <DialogTitle>Edit Caption Mapping</DialogTitle>
            <DialogDescription>
              Update the study or caption linked to this mapping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Study</Label>
              <Select
                value={editMappingStudyId}
                onValueChange={setEditMappingStudyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select study" />
                </SelectTrigger>
                <SelectContent>
                  {sortedStudies.map((study) => (
                    <SelectItem key={study.id} value={study.id.toString()}>
                      {getStudyLabel(study)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Caption ID</Label>
              <Input
                value={editMappingCaptionId}
                onChange={(e) => setEditMappingCaptionId(e.target.value)}
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
              Remove this caption mapping from the study? This action cannot be undone.
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
