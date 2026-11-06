import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Copy, Calendar, ExternalLink, ChevronLeft, ChevronRight, Edit2, Save, X, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/utils/supabase/client";
import UserImage from "@/types/userImage";
import { ImageService } from "@/services/images.service";
import { deleteImageAction } from "@/app/actions/delete-image";
import Category from "@/types/common-use-category";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTimeZone } from "@/components/TimeZoneContext";
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

interface ImageDetailDialogProps {
  open: boolean;
  onClose: () => void;
  image: UserImage | null;
  images?: UserImage[]; // All images for navigation
  onNavigate?: (image: UserImage) => void;
  onImageDeleted?: (imageId: string) => void;
  isCommonUseContext?: boolean; // Indicates if dialog is used in common use context
  showAdditionalContextEditor?: boolean;
  onSaveAdditionalContext?: (imageID: string, value: string) => Promise<boolean>;
}

export default function ImageDetailDialog({
  open,
  onClose,
  image,
  images = [],
  onNavigate,
  onImageDeleted,
  isCommonUseContext = false,
  showAdditionalContextEditor,
  onSaveAdditionalContext
}: ImageDetailDialogProps) {
  const { timeZone } = useTimeZone();
  const [captions, setCaptions] = useState<any[]>([]);
  const [isLoadingCaptions, setIsLoadingCaptions] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [originalCategoryIds, setOriginalCategoryIds] = useState<number[]>([]);
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [additionalContextDraft, setAdditionalContextDraft] = useState<string>("");
  const [isSavingContext, setIsSavingContext] = useState(false);

  useEffect(() => {
    if (image && images.length > 0) {
      const index = images.findIndex(img => img.id === image.id);
      setCurrentIndex(index >= 0 ? index : 0);
    }
  }, [image, images]);


  useEffect(() => {
    const fetchCategories = async () => {
      if (!supabase) {
        console.error("Supabase client not available");
        return;
      }
      setIsLoadingCategories(true);
      try {
        const { data, error } = await supabase
          .from("common_use_categories")
          .select("*")
          .order("name");

        if (error) {
          console.error("Error fetching categories:", error);
          setCategories([]);
        } else {
          setCategories(data || []);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        setCategories([]);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    if (open) {
      fetchCategories();
    }
  }, [open]);

  useEffect(() => {
    const fetchImageCategories = async () => {
      if (!image || !open) return;

      // Add a small delay to ensure categories are loaded first
      setTimeout(async () => {
        try {
          const categoryIds = await ImageService.getImageCategories(image.id);
          setSelectedCategoryIds(categoryIds);
          setOriginalCategoryIds(categoryIds);
        } catch (error) {
          console.error("Error fetching image categories:", error);
          setSelectedCategoryIds([]);
          setOriginalCategoryIds([]);
        }
      }, 100);
    };

    if (open && image) {
      fetchImageCategories();
    }
  }, [open, image]);

  useEffect(() => {
    const fetchCaptions = async () => {
      if (!image || !open) return;

      setIsLoadingCaptions(true);
      try {
        if (!supabase) {
          setCaptions([]);
          return;
        }

        const { data, error } = await supabase
          .from("captions")
          .select(`
            id,
            content,
            created_datetime_utc,
            profile_id,
            image_id
          `)
          .eq("image_id", image.id)
          .order("created_datetime_utc", { ascending: false });

        if (error) throw error;
        setCaptions(data || []);
      } catch (error) {
        console.error("Error fetching captions:", error);
        setCaptions([]);
      } finally {
        setIsLoadingCaptions(false);
      }
    };

    if (open && image) {
      fetchCaptions();
      setImageError(false);
      setIsEditingCategories(false);
    } else if (!open) {
      // Reset states when dialog closes
      setSelectedCategoryIds([]);
      setOriginalCategoryIds([]);
      setIsEditingCategories(false);
    }
  }, [open, image]);

  useEffect(() => {
    if (image) {
      setAdditionalContextDraft(
        (image as any).additional_context ?? (image as any).additionalContext ?? ""
      );
    } else {
      setAdditionalContextDraft("");
    }
  }, [image, open]);


  const handleSaveCategories = async () => {
    if (!image) return;

    setIsSavingCategories(true);
    try {
      const result = await ImageService.updateImageCategories(image.id, selectedCategoryIds);

      if (result.success) {
        toast({
          title: "Categories updated",
          description: "Image categories have been successfully updated",
        });
        setOriginalCategoryIds(selectedCategoryIds);
        setIsEditingCategories(false);
      } else {
        toast({
          title: "Update failed",
          description: result.error || "Failed to update categories",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: "An error occurred while updating categories",
        variant: "destructive",
      });
    } finally {
      setIsSavingCategories(false);
    }
  };

  const toggleCategory = (categoryId: number) => {
    setSelectedCategoryIds(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const cancelCategoryEdit = () => {
    setSelectedCategoryIds(originalCategoryIds);
    setIsEditingCategories(false);
  };

  const copyCaption = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Caption copied",
      description: "Caption text copied to clipboard",
    });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short'
    });
  };

  const handlePrevious = () => {
    if (images.length > 0 && currentIndex > 0) {
      const prevImage = images[currentIndex - 1];
      if (onNavigate) onNavigate(prevImage);
    }
  };

  const handleNext = () => {
    if (images.length > 0 && currentIndex < images.length - 1) {
      const nextImage = images[currentIndex + 1];
      if (onNavigate) onNavigate(nextImage);
    }
  };

  const handleOpenInNewTab = () => {
    if (!image?.url) return;
    window.open(image.url, '_blank');
  };

  const handleDelete = async () => {
    if (!image) return;

    setIsDeleting(true);

    try {
      const result = await deleteImageAction(image.id);
      if (!result.success) {
        throw new Error(result.error);
      }

      // Close the image detail dialog
      onClose();

      // Notify parent component
      if (onImageDeleted) {
        onImageDeleted(image.id);
      }

      toast({
        title: "Image deleted",
        description: "The image has been successfully deleted",
      });

      setDeleteDialogOpen(false);
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Failed to process image deletion",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!image) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle 
              className="text-xl font-semibold"
            >
              Image Details
            </DialogTitle>
            <div className="flex items-center gap-2 mr-8">
              {images.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    {currentIndex + 1} / {images.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNext}
                    disabled={currentIndex === images.length - 1}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenInNewTab}
                className="h-8 w-8"
                title="Open in new tab"
                disabled={!image.url}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              {isCommonUseContext && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                  title="Delete image"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <div className="h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 break-all">
            Image ID: <span className="text-foreground">{image.id}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Uploaded {formatDate(image.created_datetime_utc.toString())}
          </p>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
          {/* Image Section */}
          <div className="bg-black flex items-center justify-center p-4 overflow-auto min-h-0">
            {!imageError && image.url ? (
              <img
                src={image.url}
                alt={`Image ${image.id}`}
                className="w-auto h-auto max-w-full max-h-full object-contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex items-center justify-center bg-muted w-full h-full">
                <p className="text-muted-foreground">
                  {image.url ? "Failed to load image" : "Image unavailable"}
                </p>
              </div>
            )}
          </div>

          {/* Details & Captions Section */}
          <div className="flex flex-col bg-background min-h-0">
            {/* Categories Section */}
            <div className="px-6 py-4 border-b flex-shrink-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Categories</Label>
                  {!isEditingCategories ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingCategories(true)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelCategoryEdit}
                        disabled={isSavingCategories}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSaveCategories}
                        disabled={isSavingCategories}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                    </div>
                  )}
                </div>

                {isEditingCategories ? (
                  <ScrollArea className="h-[150px] border rounded-md p-3">
                    {isLoadingCategories ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : categories.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No categories available
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {categories.map((category) => {
                          if (!category || typeof category.id === 'undefined') {
                            console.warn('Invalid category:', category);
                            return null;
                          }
                          return (
                            <label
                              key={category.id}
                              className="flex items-center space-x-2 cursor-pointer hover:bg-muted/60 p-1 rounded"
                            >
                              <Checkbox
                                checked={selectedCategoryIds.includes(category.id)}
                                onCheckedChange={() => toggleCategory(category.id)}
                                disabled={isSavingCategories}
                              />
                              <span className="text-sm">{category.name || 'Unnamed'}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedCategoryIds.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No categories assigned</span>
                    ) : (
                      categories
                        .filter(cat => selectedCategoryIds.includes(cat.id))
                        .map(category => (
                          <span
                            key={category.id}
                            className="px-2 py-1 bg-muted rounded-md text-sm"
                          >
                            {category.name}
                          </span>
                        ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {showAdditionalContextEditor && (
              <>
                <Separator />
                <div className="px-6 py-4 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">Additional Context</Label>
                  </div>

                  <textarea
                    className="w-full rounded-md border p-2 text-sm"
                    rows={4}
                    placeholder="Describe the context in which this photo was taken."
                    value={additionalContextDraft}
                    onChange={(e) => setAdditionalContextDraft(e.target.value)}
                    disabled={isSavingContext}
                  />

                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!image || !onSaveAdditionalContext) return;
                        setIsSavingContext(true);
                        const ok = await onSaveAdditionalContext(image.id, additionalContextDraft);
                        setIsSavingContext(false);
                        if (ok) {
                          toast({ title: "Saved", description: "Additional context updated." });
                        } else {
                          toast({
                            title: "Save failed",
                            description: "Could not update additional context.",
                            variant: "destructive",
                          });
                        }
                      }}
                      disabled={isSavingContext}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                    </div>
                </div>
              </>
            )}

            {/* Captions Section */}
            <div className="flex-shrink-0 px-6 py-3 border-b">
              <h3 className="font-semibold">Captions ({captions.length})</h3>
            </div>

            <ScrollArea className="flex-1 px-6 overflow-y-auto">
              {isLoadingCaptions ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : captions.length > 0 ? (
                <div className="space-y-3 py-4">
                  {captions.map((caption) => (
                    <div
                      key={caption.id}
                      className="group p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {caption.content || caption.caption_text || '—'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(caption.created_datetime_utc)}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyCaption(caption.content || caption.caption_text || '')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No captions for this image</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this image? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
