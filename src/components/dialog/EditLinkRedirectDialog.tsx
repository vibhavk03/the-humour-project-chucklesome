"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LinkRedirectsService } from "@/services/link-redirects.service";
import LinkRedirect from "@/types/link-redirect";
import { Loader2, Edit2 } from "lucide-react";

interface EditLinkRedirectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: LinkRedirect | null;
  onSuccess: (link: LinkRedirect) => void;
}

export default function EditLinkRedirectDialog({
  open,
  onOpenChange,
  link,
  onSuccess,
}: EditLinkRedirectDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (link) {
      setName(link.name);
      setSlug(link.slug);
      setDestinationUrl(link.destination_url);
    }
  }, [link]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!link) return;

    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Link name is required",
        variant: "destructive",
      });
      return;
    }

    if (!slug.trim()) {
      toast({
        title: "Error",
        description: "Slug is required",
        variant: "destructive",
      });
      return;
    }

    if (!destinationUrl.trim()) {
      toast({
        title: "Error",
        description: "Destination URL is required",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(destinationUrl);
    } catch {
      toast({
        title: "Error",
        description: "Please enter a valid URL (e.g., https://example.com)",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Normalize slug: lowercase, replace spaces with hyphens, remove special chars
      const normalizedSlug = slug
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      const updatedLink = await LinkRedirectsService.update(link.id, {
        name: name.trim(),
        slug: normalizedSlug,
        destination_url: destinationUrl.trim(),
      });
      
      if (updatedLink) {
        toast({
          title: "Success",
          description: "Link redirect updated successfully",
        });
        
        onSuccess(updatedLink);
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update link redirect",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (link) {
      setName(link.name);
      setSlug(link.slug);
      setDestinationUrl(link.destination_url);
    }
    onOpenChange(false);
  };

  if (!link) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            Edit Link Redirect
          </DialogTitle>
          <DialogDescription>
            Update the link redirect details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-link-name">Name</Label>
            <Input
              id="edit-link-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter link name"
              disabled={isLoading}
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-link-slug">Slug</Label>
            <Input
              id="edit-link-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Enter slug"
              disabled={isLoading}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Used in the redirect URL: /link/[slug]
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-destination-url">Destination URL</Label>
            <Input
              id="edit-destination-url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={isLoading}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Update Link
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
