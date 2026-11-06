"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { LinkRedirectsService } from "@/services/link-redirects.service";
import LinkRedirect from "@/types/link-redirect";
import { Loader2, Trash2 } from "lucide-react";

interface DeleteLinkRedirectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: LinkRedirect | null;
  onSuccess: () => void;
}

export default function DeleteLinkRedirectDialog({
  open,
  onOpenChange,
  link,
  onSuccess,
}: DeleteLinkRedirectDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!link) return;

    setIsLoading(true);

    try {
      await LinkRedirectsService.delete(link.id);
      
      toast({
        title: "Success",
        description: "Link redirect deleted successfully",
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete link redirect",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!link) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Delete Link Redirect
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{link.name}&quot;? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

