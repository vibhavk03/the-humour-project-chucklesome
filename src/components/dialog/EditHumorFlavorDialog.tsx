"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HumorFlavorsService } from "@/services/humor-flavors.service";
import { HumorService } from "@/services/humor.service";
import { HumorFlavor } from "@/types/humor-flavor";
import HumorTheme from "@/types/humor-theme";
import { useToast } from "@/hooks/use-toast";

interface EditHumorFlavorDialogProps {
  flavor: HumorFlavor | null;
  onOpenChange: () => void;
  onSuccess: () => void;
}

export default function EditHumorFlavorDialog({ flavor, onOpenChange, onSuccess }: EditHumorFlavorDialogProps) {
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [themes, setThemes] = useState<HumorTheme[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (flavor) {
      setSlug(flavor.slug);
      setDescription(flavor.description || "");
      loadThemes();
    }
  }, [flavor]);

  const loadThemes = async () => {
    if (!flavor) return;
    setIsLoadingThemes(true);
    try {
      const [allThemes, assignedThemeIds] = await Promise.all([
        HumorService.getAllThemes(),
        HumorService.getThemesByFlavorId(flavor.id),
      ]);
      setThemes(allThemes || []);
      setSelectedThemeIds(assignedThemeIds || []);
    } catch (error) {
      console.error("Failed to load themes:", error);
      toast({
        title: "Error",
        description: "Failed to load themes",
        variant: "destructive",
      });
    } finally {
      setIsLoadingThemes(false);
    }
  };

  const handleThemeToggle = (themeId: number) => {
    setSelectedThemeIds((prev) =>
      prev.includes(themeId)
        ? prev.filter((id) => id !== themeId)
        : [...prev, themeId]
    );
  };

  const handleSubmit = async () => {
    if (!flavor) return;
    if (!slug) {
      toast({
        title: "Error",
        description: "Slug is required.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await HumorFlavorsService.update(flavor.id, { slug, description });
      await HumorService.assignThemesToFlavor(flavor.id, selectedThemeIds);
      toast({
        title: "Success",
        description: "Humor flavor updated successfully",
      });
      onSuccess();
      onOpenChange();
    } catch (error) {
      console.error("Failed to update humor flavor:", error);
      toast({
        title: "Error",
        description: "Failed to update flavor. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!flavor} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Humor Flavor</DialogTitle>
          <DialogDescription>
            Update the details for this humor flavor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="slug-edit" className="text-right">Slug</Label>
            <Input id="slug-edit" value={slug} onChange={(e) => setSlug(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description-edit" className="text-right">Description</Label>
            <Textarea id="description-edit" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Themes</Label>
            <div className="col-span-3">
              {isLoadingThemes ? (
                <div className="text-sm text-muted-foreground">Loading themes...</div>
              ) : themes.length === 0 ? (
                <div className="text-sm text-muted-foreground">No themes available</div>
              ) : (
                <ScrollArea className="h-48 rounded-md border p-4">
                  <div className="space-y-2">
                    {themes.map((theme) => (
                      <div key={theme.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`theme-${theme.id}`}
                          checked={selectedThemeIds.includes(theme.id)}
                          onCheckedChange={() => handleThemeToggle(theme.id)}
                        />
                        <Label
                          htmlFor={`theme-${theme.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {theme.name ?? "Untitled"}
                          {theme.description && (
                            <span className="text-muted-foreground ml-2">
                              - {theme.description}
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onOpenChange}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
