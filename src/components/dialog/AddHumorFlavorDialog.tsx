"use client";

import { useState } from "react";
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

interface AddHumorFlavorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function AddHumorFlavorDialog({ open, onOpenChange, onSuccess }: AddHumorFlavorDialogProps) {
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setSlug("");
    setDescription("");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!slug) {
      alert("Slug is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await HumorFlavorsService.create({ slug, description });
      onSuccess();
      handleClose();
    } catch (error) {
      console.error("Failed to create humor flavor:", error);
      alert("Failed to create flavor. Check console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Humor Flavor</DialogTitle>
          <DialogDescription>
            Enter the details for the new humor flavor. Slug is required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="slug" className="text-right">Slug</Label>
            <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}