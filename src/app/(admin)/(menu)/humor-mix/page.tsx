"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { HumorFlavorMixService, HumorFlavorMixWithFlavor } from "@/services/humor-flavor-mix.service";
import { HumorFlavorsService } from "@/services/humor-flavors.service";
import type HumorFlavor from "@/types/humor-flavor";
import { Loader2, Trash2, Search, Check, X, Edit } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/TimeZoneContext";

export default function HumorMixPage() {
  const { timeZone } = useTimeZone();
  const [mixes, setMixes] = useState<HumorFlavorMixWithFlavor[]>([]);
  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [deletingMix, setDeletingMix] = useState<HumorFlavorMixWithFlavor | null>(null);
  const [editingMix, setEditingMix] = useState<HumorFlavorMixWithFlavor | null>(null);
  const [editCaptionCount, setEditCaptionCount] = useState<string>("");

  const [selectedFlavorId, setSelectedFlavorId] = useState<string>("");
  const [captionCount, setCaptionCount] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [mixesData, flavorsData] = await Promise.all([
        HumorFlavorMixService.getAll(true),
        HumorFlavorsService.getAll(),
      ]);
      setMixes(mixesData || []);
      setFlavors(flavorsData || []);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredMixes = useMemo(() => {
    if (!searchTerm.trim()) return mixes;
    const term = searchTerm.toLowerCase();
    return mixes.filter(
      (mix) =>
        mix.humor_flavor?.slug?.toLowerCase().includes(term) ||
        mix.humor_flavor?.description?.toLowerCase().includes(term)
    );
  }, [mixes, searchTerm]);

  const selectedFlavor = useMemo(() => {
    if (!selectedFlavorId) return undefined;
    return flavors.find((flavor) => flavor.id.toString() === selectedFlavorId);
  }, [flavors, selectedFlavorId]);

  const mixFlavorIds = useMemo(() => {
    return new Set(mixes.map((mix) => mix.humor_flavor_id));
  }, [mixes]);

  const { availableFlavors, inMixFlavors } = useMemo(() => {
    const available = flavors.filter((flavor) => !mixFlavorIds.has(flavor.id));
    const inMix = flavors.filter((flavor) => mixFlavorIds.has(flavor.id));
    const sortBySlug = (a: HumorFlavor, b: HumorFlavor) => a.slug.localeCompare(b.slug);
    available.sort(sortBySlug);
    inMix.sort(sortBySlug);
    return { availableFlavors: available, inMixFlavors: inMix };
  }, [flavors, mixFlavorIds]);

  const resetForm = () => {
    setSelectedFlavorId("");
    setCaptionCount("");
  };

  const handleSelectFlavor = (flavor: HumorFlavor) => {
    setSelectedFlavorId(flavor.id.toString());
    setCaptionCount((prev) => (prev ? prev : "1"));
  };

  const openEditDialog = (mix: HumorFlavorMixWithFlavor) => {
    setEditingMix(mix);
    setEditCaptionCount(mix.caption_count.toString());
    setDeletingMix(null);
  };

  const handleAddMix = async () => {
    if (!selectedFlavorId) {
      toast({
        title: "Error",
        description: "Please select a humor flavor",
        variant: "destructive",
      });
      return;
    }

    const selectedId = Number(selectedFlavorId);
    if (mixFlavorIds.has(selectedId)) {
      toast({
        title: "Already in mix",
        description: "That humor flavor is already in the mix.",
        variant: "destructive",
      });
      return;
    }

    const count = parseInt(captionCount);
    if (isNaN(count) || count < 1) {
      toast({
        title: "Error",
        description: "Caption count must be a valid positive number",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const newMix = await HumorFlavorMixService.create(selectedId, count);
      if (newMix) {
        toast({
          title: "Success",
          description: "Humor flavor added successfully",
        });
        resetForm();
        loadData();
      } else {
        toast({
          title: "Error",
          description: "Failed to add humor flavor. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error adding flavor:", error);
      const errorMessage = "Failed to add humor flavor to mix";

      toast({
        title: "Insertion Error",
        description: errorMessage,
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditMix = async () => {
    if (!editingMix) return;

    const count = parseInt(editCaptionCount);
    if (isNaN(count) || count < 1) {
      toast({
        title: "Error",
        description: "Caption count must be a valid positive number",
        variant: "destructive",
      });
      return;
    }

    setIsEditing(true);
    try {
      const updated = await HumorFlavorMixService.update(editingMix.id, {
        caption_count: count,
      });
      if (updated) {
        toast({
          title: "Success",
          description: "Caption count updated successfully",
        });
        setEditingMix(null);
        setEditCaptionCount("");
        loadData();
      } else {
        throw new Error("Failed to update mix");
      }
    } catch (error) {
      console.error("Error updating mix:", error);
      toast({
        title: "Error",
        description: "Failed to update caption count",
        variant: "destructive",
      });
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteMix = async () => {
    if (!deletingMix) return;

    try {
      const success = await HumorFlavorMixService.delete(deletingMix.id);
      if (success) {
        toast({
          title: "Success",
          description: "Humor flavor deleted successfully",
        });
        setDeletingMix(null);
        loadData();
      } else {
        throw new Error("Failed to delete flavor");
      }
    } catch (error) {
      console.error("Error deleting flavor:", error);
      toast({
        title: "Error",
        description: "Failed to delete humor flavor",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Humor Mix</h1>
          <p className="page-subtitle">
            Manage the humor flavors used in captions generation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-sans">
            {mixes.length} in mix
          </Badge>
          <Badge variant="outline" className="font-sans">
            {availableFlavors.length} available
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Card className="animate-in fade-in-0 slide-in-from-left-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Add to Mix</CardTitle>
                <CardDescription>
                  Search flavors, set a caption count, and add them to the mix.
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-sans">Add</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 animate-in fade-in-0">
              <Command shouldFilter={true}>
                <CommandInput placeholder="Search flavors by slug or description..." />
                <CommandList className="max-h-[360px]">
                  <CommandEmpty>
                    {flavors.length === 0
                      ? "No humor flavors available."
                      : "No flavors match your search."}
                  </CommandEmpty>
                  <CommandGroup heading={`Available to add (${availableFlavors.length})`}>
                    {availableFlavors.map((flavor) => {
                      const searchValue = [
                        flavor.slug,
                        flavor.description,
                      ]
                        .filter(Boolean)
                        .join(" ");
                      const isSelected = selectedFlavorId === flavor.id.toString();
                      return (
                        <CommandItem
                          key={flavor.id}
                          value={searchValue}
                          onSelect={() => handleSelectFlavor(flavor)}
                          className={cn(
                            "flex items-start justify-between gap-3 data-[selected=true]:bg-muted/50 data-[selected=true]:text-foreground",
                            isSelected &&
                              "bg-accent text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{flavor.slug}</span>
                            {flavor.description && (
                              <span className="text-xs text-muted-foreground">{flavor.description}</span>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="mt-0.5 h-4 w-4 text-primary" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  {inMixFlavors.length > 0 && (
                    <CommandGroup heading={`Already in mix (${inMixFlavors.length})`}>
                      {inMixFlavors.map((flavor) => {
                        const searchValue = [
                          flavor.slug,
                          flavor.description,
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <CommandItem
                            key={flavor.id}
                            value={searchValue}
                            disabled
                            className="flex items-start justify-between gap-3 opacity-60"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{flavor.slug}</span>
                              {flavor.description && (
                                <span className="text-xs text-muted-foreground">{flavor.description}</span>
                              )}
                            </div>
                            <Badge variant="secondary" className="font-sans">In mix</Badge>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="caption-count">Caption Count</Label>
                {selectedFlavor ? (
                  <Badge variant="secondary" className="font-sans">
                    Selected: {selectedFlavor.slug}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Select a flavor to continue</span>
                )}
              </div>
              <Input
                id="caption-count"
                type="number"
                min="1"
                value={captionCount}
                onChange={(e) => setCaptionCount(e.target.value)}
                placeholder="Enter caption count"
              />
              {selectedFlavor?.description && (
                <p className="text-xs text-muted-foreground">{selectedFlavor.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleAddMix}
                  disabled={isSaving || !selectedFlavorId || !captionCount}
                >
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add to Mix
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                  disabled={!selectedFlavorId && !captionCount}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in-0 slide-in-from-right-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Current Mix Flavors</CardTitle>
                <CardDescription>
                  View and manage all humor flavors in the mix.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search flavors by name or slug..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 w-full sm:w-64"
                  />
                </div>
                <Badge variant="secondary" className="font-sans">
                  {filteredMixes.length} shown
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredMixes.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  {searchTerm
                    ? "No flavors found matching your search"
                    : "No humor flavors in the mix yet"}
                </p>
              </div>
            ) : (
              <div>
                <table className="w-full table-base table-fixed">
                  <thead className="table-head">
                    <tr>
                      <th>
                        ID
                      </th>
                      <th>
                        Humor Flavor
                      </th>
                      <th>
                        Caption Count
                      </th>
                      <th>
                        Created
                      </th>
                      <th className="text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {filteredMixes.map((mix) => (
                      <tr
                        key={mix.id}
                        className="hover:bg-muted/60 transition-colors animate-in fade-in-0"
                      >
                        <td className="font-sans break-all">
                          {mix.id}
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="max-w-[14rem] truncate font-medium text-foreground">
                              {mix.humor_flavor?.slug || `Flavor ID: ${mix.humor_flavor_id}`}
                            </span>
                            {mix.humor_flavor?.description && (
                              <span className="text-sm text-muted-foreground break-words">
                                {mix.humor_flavor.description}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="font-medium text-foreground">
                            {mix.caption_count}
                          </span>
                        </td>
                        <td className="text-muted-foreground">
                          {new Date(mix.created_datetime_utc).toLocaleDateString("en-US", {
                            timeZone,
                          })}
                        </td>
                        <td className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(mix)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeletingMix(mix);
                                setEditingMix(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!editingMix}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMix(null);
            setEditCaptionCount("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Caption Count</DialogTitle>
            <DialogDescription>
              Update the caption count for this humor flavor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Humor Flavor</p>
              <p className="text-sm font-medium text-foreground">
                {editingMix?.humor_flavor?.slug || `Flavor ID ${editingMix?.humor_flavor_id}`}
              </p>
              {editingMix?.humor_flavor?.description && (
                <p className="text-xs text-muted-foreground">
                  {editingMix.humor_flavor.description}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-caption-count">Caption Count</Label>
              <Input
                id="edit-caption-count"
                type="number"
                min="1"
                value={editCaptionCount}
                onChange={(e) => setEditCaptionCount(e.target.value)}
                placeholder="Enter caption count"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingMix(null);
                setEditCaptionCount("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditMix} disabled={isEditing || !editCaptionCount}>
              {isEditing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingMix}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingMix(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete humor flavor?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deletingMix?.humor_flavor?.slug || `Flavor ID ${deletingMix?.humor_flavor_id}`} from the mix? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMix}
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
