"use client";

import { useState } from "react";
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
import { HumorFlavorsService } from "@/services/humor-flavors.service";
import { HumorFlavor } from "@/types/humor-flavor";
import { Button } from "../ui/button";

interface DeleteHumorFlavorDialogProps {
  flavor: HumorFlavor | null;
  onOpenChange: () => void;
  onSuccess: () => void;
}

export default function DeleteHumorFlavorDialog({ flavor, onOpenChange, onSuccess }: DeleteHumorFlavorDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!flavor) return;

    setIsDeleting(true);
    try {
      await HumorFlavorsService.delete(flavor.id);
      onSuccess();
      onOpenChange();
    } catch (error) {
      console.error("Error deleting flavor:", error);
      alert("Failed to delete flavor. Check console for details.");
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <AlertDialog open={!!flavor} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the 
            <span className="font-semibold"> &quot;{flavor?.slug}&quot; </span> 
            flavor.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button 
            variant="destructive"
            onClick={handleDelete} 
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}