"use client";

import { useEffect, useState } from "react";
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
import { HumorFlavorsService } from "@/services/humor-flavors.service";
import { HumorFlavorStepsService } from "@/services/humor-flavor-steps.service";
import { HumorService } from "@/services/humor.service";
import { HumorFlavor } from "@/types/humor-flavor";
import { useToast } from "@/hooks/use-toast";

interface DuplicateHumorFlavorDialogProps {
  flavor: HumorFlavor | null;
  onOpenChange: () => void;
  onSuccess: (createdFlavor?: HumorFlavor) => void;
}

export default function DuplicateHumorFlavorDialog({
  flavor,
  onOpenChange,
  onSuccess,
}: DuplicateHumorFlavorDialogProps) {
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (flavor) {
      const baseSlug = flavor.slug?.trim() || "flavor";
      setSlug(`${baseSlug}-copy`);
      setDescription(flavor.description || "");
    } else {
      setSlug("");
      setDescription("");
    }
  }, [flavor]);

  const handleClose = () => {
    setSlug("");
    setDescription("");
    onOpenChange();
  };

  const handleSubmit = async () => {
    if (!flavor) return;
    const nextSlug = slug.trim();
    if (!nextSlug) {
      toast({
        title: "Slug is required",
        description: "Please enter a unique slug for the new flavor.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const createdFlavor = await HumorFlavorsService.create({
        slug: nextSlug,
        description,
      });

      const themeIds = flavor.theme_ids || [];
      if (themeIds.length > 0) {
        await HumorService.assignThemesToFlavor(createdFlavor.id, themeIds);
      }

      const duplicationResult = await HumorFlavorStepsService.duplicateStepsForFlavor(
        flavor.id,
        createdFlavor.id,
      );

      if ((duplicationResult as { error?: { message?: string } })?.error) {
        const err = (duplicationResult as { error?: { message?: string } }).error;
        toast({
          title: "Flavor created, steps not copied",
          description: err?.message || "Please retry copying steps from the new flavor.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Flavor duplicated",
          description: "New flavor created with copied steps.",
        });
      }

      onSuccess(createdFlavor);
      handleClose();
    } catch (error) {
      console.error("Failed to duplicate humor flavor:", error);
      toast({
        title: "Error",
        description: "Failed to duplicate flavor. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!flavor} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Humor Flavor</DialogTitle>
          <DialogDescription>
            Create a new flavor by copying the steps from{flavor ? ` ${flavor.slug}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="duplicate-slug" className="text-right">Slug</Label>
            <Input
              id="duplicate-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="duplicate-description" className="text-right">Description</Label>
            <Textarea
              id="duplicate-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Duplicating..." : "Duplicate Flavor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
