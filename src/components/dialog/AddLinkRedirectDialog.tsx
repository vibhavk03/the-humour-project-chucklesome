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
import { Loader2, Plus } from "lucide-react";

interface AddLinkRedirectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (link: LinkRedirect) => void;
}

export default function AddLinkRedirectDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddLinkRedirectDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setName("");
      setSlug("");
      setDestinationUrl("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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

      const newLink = await LinkRedirectsService.create({
        name: name.trim(),
        slug: normalizedSlug,
        destination_url: destinationUrl.trim(),
      });
      
      if (newLink) {
        toast({
          title: "Success",
          description: "Link redirect created successfully",
        });
        
        setName("");
        setSlug("");
        setDestinationUrl("");
        onSuccess(newLink);
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create link redirect",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setName("");
    setSlug("");
    setDestinationUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Link Redirect
          </DialogTitle>
          <DialogDescription>
            Create a new link redirect that tracks visits before redirecting.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-name">Name</Label>
            <Input
              id="link-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter link name"
              disabled={isLoading}
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-slug">Slug</Label>
            <Input
              id="link-slug"
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
            <Label htmlFor="destination-url">Destination URL</Label>
            <Input
              id="destination-url"
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
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Link
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
