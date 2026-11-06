"use client";

import React, { useState } from "react";
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
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CategoriesService } from "@/services/categories.service";
import Category from "@/types/common-use-category";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  onSuccess: () => void;
}

export default function DeleteCategoryDialog({
  open,
  onOpenChange,
  category,
  onSuccess,
}: DeleteCategoryDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [imageCount, setImageCount] = useState<number>(0);
  const [isCheckingCount, setIsCheckingCount] = useState(false);
  const { toast } = useToast();

  // Check image count when dialog opens
  React.useEffect(() => {
    if (open && category) {
      setIsCheckingCount(true);
      CategoriesService.getImageCountForCategory(category.id)
        .then(count => setImageCount(count))
        .finally(() => setIsCheckingCount(false));
    } else {
      setImageCount(0);
    }
  }, [open, category]);

  const handleDelete = async () => {
    if (!category) return;

    setIsLoading(true);

    try {
      const success = await CategoriesService.deleteCategory(category.id);
      
      if (success) {
        toast({
          title: "Success",
          description: "Category deleted successfully",
        });
        
        onSuccess();
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete category" ,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canDelete = !isCheckingCount && imageCount === 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Category
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isCheckingCount ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Checking if category is in use...
              </>
            ) : canDelete ? (
              <>
                Are you sure you want to delete <strong>&quot;{category?.name}&quot;</strong>?
                <br />
                This action cannot be undone.
              </>
            ) : (
              <>
                Cannot delete <strong>&quot;{category?.name}&quot;</strong> because it has {imageCount} image(s) assigned to it.
                <br />
                Please remove or reassign these images before deleting the category.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          {canDelete && (
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading || isCheckingCount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Category"
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
