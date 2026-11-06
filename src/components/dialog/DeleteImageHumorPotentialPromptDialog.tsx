"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageHumorPotentialPromptsService } from "@/services/image-humor-potential-prompts.service";
import ImageHumorPotentialPrompt from "@/types/image-humor-potential-prompt";
import { useToast } from "@/hooks/use-toast";

const CONFIRM_WORD = "DELETE";

interface DeleteImageHumorPotentialPromptDialogProps {
  prompt: ImageHumorPotentialPrompt | null;
  onOpenChange: () => void;
  onSuccess: () => void;
}

export default function DeleteImageHumorPotentialPromptDialog({
  prompt,
  onOpenChange,
  onSuccess,
}: DeleteImageHumorPotentialPromptDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setConfirmText("");
  }, [prompt]);

  const handleDelete = async () => {
    if (!prompt || confirmText !== CONFIRM_WORD) return;

    setIsDeleting(true);
    try {
      await ImageHumorPotentialPromptsService.softDelete(prompt.id);
      toast({ title: "Success", description: "Prompt deactivated" });
      onSuccess();
      onOpenChange();
    } catch (error) {
      console.error("Failed to delete prompt:", error);
      toast({
        title: "Error",
        description: "Failed to deactivate prompt. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={!!prompt} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
          <AlertDialogDescription>
            This will deactivate &quot;{prompt?.name}&quot;. Historical scores that used this
            prompt will keep their record. Type DELETE to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE"
          autoComplete="off"
          disabled={isDeleting}
        />
        <AlertDialogFooter>
          <Button variant="outline" onClick={onOpenChange} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || confirmText !== CONFIRM_WORD}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
