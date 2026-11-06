"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { HumorFlavorStepsService } from "@/services/humor-flavor-steps.service";

export default function DeleteHumorFlavorStepDialog({
  stepId,
  onStepDeleted,
}: {
  stepId: number;
  onStepDeleted: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    const { error } = (await HumorFlavorStepsService.deleteStep(stepId)) as any;
    setIsDeleting(false);

    if (error) {
      toast({ title: "Error", description: "Failed to delete step.", variant: "destructive" });
      return;
    }

    toast({ title: "Step deleted" });
    setIsOpen(false);
    onStepDeleted();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10 [&_svg]:size-5"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Step</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this step? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
