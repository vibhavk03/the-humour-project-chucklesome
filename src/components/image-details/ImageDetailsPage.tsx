"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Copy, Calendar, Save, Trash2, ExternalLink, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/utils/supabase/client";
import { applyUpdateAuditFields, getCurrentProfileId } from "@/utils/supabase/audit";
import UserImage from "@/types/userImage";
import { ImageService } from "@/services/images.service";
import { CaptionService } from "@/services/captions.service";
import Category from "@/types/common-use-category";
import { deleteImageAction } from "@/app/actions/delete-image";
import { Label } from "@/components/ui/label";
import { Captions, LLMResponse } from "@/types/captions";
import { Switch } from "@/components/ui/switch";
import { useTimeZone } from "@/components/TimeZoneContext";

type CaptionListItem = Pick<Captions, "id" | "content"> &
  Partial<Pick<Captions, "created_datetime_utc" | "llm_responses">>;
type ImageUploader = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};
type ImageWithUploader = UserImage & {
  uploader?: ImageUploader | ImageUploader[] | null;
};
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImageDetailsPageProps {
  imageId: string;
}

export default function ImageDetailsPage({ imageId }: ImageDetailsPageProps) {
  const router = useRouter();
  const { timeZone } = useTimeZone();
  const [image, setImage] = useState<ImageWithUploader | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(true);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionListItem[]>([]);
  const [isLoadingCaptions, setIsLoadingCaptions] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Categories state (for common use)
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [originalCategoryIds, setOriginalCategoryIds] = useState<number[]>([]);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // LLM Responses modal state (for user uploaded)
  const [showLLMModal, setShowLLMModal] = useState(false);
  const [selectedCaptionIndex, setSelectedCaptionIndex] = useState<number>(0);

  // Common state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [additionalContextDraft, setAdditionalContextDraft] = useState<string>("");
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [imageDescriptionDraft, setImageDescriptionDraft] = useState<string>("");
  const [celebrityRecognitionDraft, setCelebrityRecognitionDraft] = useState<string>("");
  const [isSavingImageDescription, setIsSavingImageDescription] = useState(false);
  const [isSavingCelebrityRecognition, setIsSavingCelebrityRecognition] = useState(false);
  const [isSavingCommonUse, setIsSavingCommonUse] = useState(false);
  const [isSavingPublic, setIsSavingPublic] = useState(false);
  const [captionPage, setCaptionPage] = useState(1);

  const CAPTIONS_PER_PAGE = 5;
  const isCommonUse = image?.is_common_use === true;
  const isPublic = image?.is_public === true;

  const formatDate = (dateString: any) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
        timeZoneName: "short",
      });
    } catch {
      return "Invalid date";
    }
  };

  const formatEditableValue = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      return value.map(String).filter(Boolean).join("\n");
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const parseCelebrityRecognitionDraftValue = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  useEffect(() => {
    let isActive = true;

    const fetchImage = async () => {
      if (!supabase) {
        if (isActive) {
          setImage(null);
          setIsLoadingImage(false);
          setImageLoadError("Supabase client unavailable.");
        }
        return;
      }

      setIsLoadingImage(true);
      setImageLoadError(null);

      try {
        const { data, error } = await supabase
          .from("images")
          .select("*, uploader:profiles!images_profile_id_fkey(first_name, last_name, email)")
          .eq("id", imageId)
          .single();

        if (error || !data) {
          if (isActive) {
            setImage(null);
            setImageLoadError("Image not found.");
          }
          return;
        }

        if (isActive) {
          setImage(data as UserImage);
        }
      } catch (error) {
        if (isActive) {
          setImage(null);
          setImageLoadError("Failed to load image details.");
        }
      } finally {
        if (isActive) {
          setIsLoadingImage(false);
        }
      }
    };

    if (imageId) {
      fetchImage();
    } else {
      setImage(null);
      setIsLoadingImage(false);
      setImageLoadError("Image not found.");
    }

    return () => {
      isActive = false;
    };
  }, [imageId]);

  useEffect(() => {
    setImageError(false);
  }, [image?.id]);

  // Fetch categories (only for common use)
  useEffect(() => {
    const fetchCategories = async () => {
      if (!supabase || !isCommonUse) return;

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

    if (isCommonUse) {
      fetchCategories();
    } else {
      setCategories([]);
      setSelectedCategoryIds([]);
      setOriginalCategoryIds([]);
      setIsLoadingCategories(false);
    }
  }, [isCommonUse]);

  // Fetch image categories (only for common use)
  useEffect(() => {
    const fetchImageCategories = async () => {
      if (!image || !isCommonUse) return;

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

    if (image && isCommonUse) {
      fetchImageCategories();
    }
  }, [image?.id, isCommonUse]);

  // Fetch captions
  useEffect(() => {
    const fetchCaptions = async () => {
      if (!image) return;

      setIsLoadingCaptions(true);
      try {
        if (!isCommonUse) {
          const captionsData = await CaptionService.getCaptionsByImageId(image.id);
          setCaptions(captionsData);
        } else {
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
        }
      } catch (error) {
        console.error("Error fetching captions:", error);
        setCaptions([]);
      } finally {
        setIsLoadingCaptions(false);
      }
    };

    if (image) {
      fetchCaptions();
      setShowLLMModal(false);
    } else {
      setCaptions([]);
    }
  }, [image?.id, isCommonUse]);

  // Update additional context draft
  useEffect(() => {
    if (image) {
      setAdditionalContextDraft(
        (image as any).additional_context ?? (image as any).additionalContext ?? ""
      );
      setImageDescriptionDraft(formatEditableValue(image.image_description));
      setCelebrityRecognitionDraft(formatEditableValue(image.celebrity_recognition));
    } else {
      setAdditionalContextDraft("");
      setImageDescriptionDraft("");
      setCelebrityRecognitionDraft("");
    }
  }, [image]);

  // Reset selected caption index when LLM modal opens
  useEffect(() => {
    if (showLLMModal) {
      setSelectedCaptionIndex(0);
    }
  }, [showLLMModal]);

  useEffect(() => {
    setCaptionPage(1);
  }, [image?.id]);

  const totalCaptionPages = useMemo(
    () => Math.max(1, Math.ceil(captions.length / CAPTIONS_PER_PAGE)),
    [captions.length]
  );

  const paginatedCaptions = useMemo(() => {
    const start = (captionPage - 1) * CAPTIONS_PER_PAGE;
    return captions.slice(start, start + CAPTIONS_PER_PAGE);
  }, [captionPage, captions]);

  useEffect(() => {
    if (captionPage > totalCaptionPages) {
      setCaptionPage(totalCaptionPages);
    }
  }, [captionPage, totalCaptionPages]);

  const handleCategoryToggle = async (categoryId: number) => {
    if (!image || isSavingCategories) return;

    const nextCategoryIds = selectedCategoryIds.includes(categoryId)
      ? selectedCategoryIds.filter(id => id !== categoryId)
      : [...selectedCategoryIds, categoryId];

    setSelectedCategoryIds(nextCategoryIds);
    setIsSavingCategories(true);
    try {
      const result = await ImageService.updateImageCategories(image.id, nextCategoryIds);

      if (result.success) {
        setOriginalCategoryIds(nextCategoryIds);
        toast({
          title: "Categories updated",
          description: "Image categories have been successfully updated",
        });
      } else {
        setSelectedCategoryIds(originalCategoryIds);
        toast({
          title: "Update failed",
          description: result.error || "Failed to update categories",
          variant: "destructive",
        });
      }
    } catch (error) {
      setSelectedCategoryIds(originalCategoryIds);
      toast({
        title: "Update failed",
        description: "An error occurred while updating categories",
        variant: "destructive",
      });
    } finally {
      setIsSavingCategories(false);
    }
  };

  const copyCaption = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Caption copied",
      description: "Caption text copied to clipboard",
    });
  };

  const copyImageId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({
      title: "Image ID copied",
      description: "Image ID copied to clipboard",
    });
  };

  const handleCaptionOpen = (captionId?: string | null) => {
    if (!captionId) return;
    router.push(`/caption/${captionId}`);
  };

  const updateImageRecord = async (updates: Partial<UserImage>) => {
    if (!image || !supabase) {
      return false;
    }

    const payload = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    ) as Partial<UserImage>;

    if (Object.keys(payload).length === 0) {
      return true;
    }

    try {
      const profileId = await getCurrentProfileId(supabase);
      const auditedPayload = applyUpdateAuditFields(payload, profileId);
      const { error } = await supabase
        .from("images")
        .update(auditedPayload)
        .eq("id", image.id);

      if (error) {
        console.error("Error updating image metadata:", error);
        return false;
      }

      setImage(prev => (prev ? { ...prev, ...auditedPayload } : prev));
      return true;
    } catch (error) {
      console.error("Error updating image metadata:", error);
      return false;
    }
  };

  const handleToggleCommonUse = async (nextValue: boolean) => {
    if (!image || isSavingCommonUse) return;
    setIsSavingCommonUse(true);
    const ok = await updateImageRecord({ is_common_use: nextValue });
    setIsSavingCommonUse(false);
    if (ok) {
      toast({
        title: "Common use updated",
        description: `Image is now ${nextValue ? "common use" : "not common use"}.`,
      });
    } else {
      toast({
        title: "Update failed",
        description: "Could not update common use status.",
        variant: "destructive",
      });
    }
  };

  const handleTogglePublic = async (nextValue: boolean) => {
    if (!image || isSavingPublic) return;
    setIsSavingPublic(true);
    const ok = await updateImageRecord({ is_public: nextValue });
    setIsSavingPublic(false);
    if (ok) {
      toast({
        title: "Public status updated",
        description: `Image is now ${nextValue ? "public" : "private"}.`,
      });
    } else {
      toast({
        title: "Update failed",
        description: "Could not update public status.",
        variant: "destructive",
      });
    }
  };

  const handleOpenInNewTab = () => {
    if (!image?.url) return;
    window.open(image.url, "_blank");
  };

  const handleDelete = async () => {
    if (!image) return;

    setIsDeleting(true);

    try {
      const result = await deleteImageAction(image.id);
      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Image deleted",
        description: "The image has been successfully deleted",
      });

      setDeleteDialogOpen(false);
      router.push("/images");
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

  if (isLoadingImage) {
    return (
      <div className="page-shell">
        <div className="flex items-center justify-center py-10">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="page-shell">
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {imageLoadError ?? "Image not found."}
        </div>
      </div>
    );
  }

  const uploader = Array.isArray(image.uploader) ? image.uploader[0] : image.uploader;
  const uploaderName = [uploader?.first_name?.trim(), uploader?.last_name?.trim()]
    .filter(Boolean)
    .join(" ");
  const uploaderEmail = uploader?.email?.trim() || "—";
  const uploaderLabel = uploaderName || "Unknown user";

  const captionRangeStart =
    captions.length === 0 ? 0 : (captionPage - 1) * CAPTIONS_PER_PAGE + 1;
  const captionRangeEnd = Math.min(captionPage * CAPTIONS_PER_PAGE, captions.length);

  return (
    <>
      <div className="page-shell">
        <div className="w-full">
          <div className="px-8 pt-8 pb-4 border-b">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Image Details</h1>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 break-all">
              Image ID: <span className="text-foreground">{image.id}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyImageId(image.id)}
                className="h-6 w-6 ml-1 align-middle"
                title="Copy image ID"
                aria-label="Copy image ID"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Uploaded {formatDate(image.created_datetime_utc.toString())}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Uploaded by <span className="text-foreground">{uploaderLabel}</span> |{" "}
              <span className="text-foreground break-all">{uploaderEmail}</span>
            </p>
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
            <div className="flex flex-col min-h-0">
              <div className="bg-black flex items-center justify-center p-4 overflow-auto min-h-0 flex-[1_1_0]">
                {!imageError && image.url ? (
                  <img
                    src={image.url}
                    alt={`Image ${image.id}`}
                    className="w-full h-full object-contain"
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

              <div className="flex flex-col min-h-0 flex-[2_1_0] bg-background border-t">
                <div className="flex-shrink-0 px-6 py-3 border-b">
                  <h3 className="font-semibold">Captions ({captions.length})</h3>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                  <ScrollArea className="flex-1 px-6 overflow-y-auto">
                    {isLoadingCaptions ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : captions.length > 0 ? (
                      <div className="space-y-3 py-4">
                        {paginatedCaptions.map(caption => (
                          <div
                            key={caption.id}
                            className="group p-3 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            role="button"
                            tabIndex={0}
                            onClick={() => handleCaptionOpen(caption.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleCaptionOpen(caption.id);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 space-y-2">
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                  {caption.content || "—"}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  <span>{formatDate(caption.created_datetime_utc)}</span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyCaption(caption.content || "");
                                }}
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
                          <svg
                            className="w-6 h-6 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                        </div>
                        <p className="text-sm text-muted-foreground">No captions for this image</p>
                      </div>
                    )}
                  </ScrollArea>
                  {!isLoadingCaptions && captions.length > 0 && totalCaptionPages > 1 && (
                    <div className="px-6 py-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Showing {captionRangeStart}-{captionRangeEnd} of {captions.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCaptionPage(page => Math.max(1, page - 1))}
                          disabled={captionPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Page {captionPage} of {totalCaptionPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCaptionPage(page => Math.min(totalCaptionPages, page + 1))}
                          disabled={captionPage === totalCaptionPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col bg-background min-h-0">
              <div className="px-6 py-4 border-b flex-shrink-0">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Visibility & Usage</Label>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Common Use</p>
                      <p className="text-xs text-muted-foreground">
                        Include this image in the common-use library.
                      </p>
                    </div>
                    <Switch
                      id="image-is-common-use"
                      checked={isCommonUse}
                      onCheckedChange={handleToggleCommonUse}
                      disabled={isSavingCommonUse}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Public</p>
                      <p className="text-xs text-muted-foreground">
                        Allow this image to be publicly visible.
                      </p>
                    </div>
                    <Switch
                      id="image-is-public"
                      checked={isPublic}
                      onCheckedChange={handleTogglePublic}
                      disabled={isSavingPublic}
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-b flex-shrink-0">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Image Description</Label>
                    <textarea
                      className="w-full rounded-md border p-2 text-sm"
                      rows={3}
                      placeholder="Describe what's happening in the image."
                      value={imageDescriptionDraft}
                      onChange={e => setImageDescriptionDraft(e.target.value)}
                      disabled={isSavingImageDescription}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          setIsSavingImageDescription(true);
                          const nextValue = imageDescriptionDraft.trim() || null;
                          const ok = await updateImageRecord({ image_description: nextValue });
                          setIsSavingImageDescription(false);
                          if (ok) {
                            toast({ title: "Saved", description: "Image description updated." });
                          } else {
                            toast({
                              title: "Save failed",
                              description: "Could not update image description.",
                              variant: "destructive",
                            });
                          }
                        }}
                        disabled={isSavingImageDescription}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Celebrity Recognition</Label>
                    <textarea
                      className="w-full rounded-md border p-2 text-sm"
                      rows={3}
                      placeholder="List recognized celebrities, one per line."
                      value={celebrityRecognitionDraft}
                      onChange={e => setCelebrityRecognitionDraft(e.target.value)}
                      disabled={isSavingCelebrityRecognition}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          setIsSavingCelebrityRecognition(true);
                          const nextValue = parseCelebrityRecognitionDraftValue(
                            celebrityRecognitionDraft
                          );
                          const ok = await updateImageRecord({
                            celebrity_recognition: nextValue,
                          });
                          setIsSavingCelebrityRecognition(false);
                          if (ok) {
                            toast({ title: "Saved", description: "Celebrity recognition updated." });
                          } else {
                            toast({
                              title: "Save failed",
                              description: "Could not update celebrity recognition.",
                              variant: "destructive",
                            });
                          }
                        }}
                        disabled={isSavingCelebrityRecognition}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Additional Context</Label>
                </div>

                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  rows={4}
                  placeholder="Describe the context in which this photo was taken."
                  value={additionalContextDraft}
                  onChange={e => setAdditionalContextDraft(e.target.value)}
                  disabled={isSavingContext}
                />

                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      setIsSavingContext(true);
                      const nextValue = additionalContextDraft.trim() || null;
                      const ok = await updateImageRecord({ additional_context: nextValue });
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

              {isCommonUse ? (
                <div className="px-6 py-4 border-b flex-shrink-0">
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Categories</Label>
                    <ScrollArea className="h-[150px]">
                      {isLoadingCategories ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : categories.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4">
                          No categories available
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 py-1">
                          {categories.map(category => {
                            if (!category || typeof category.id === "undefined") {
                              console.warn("Invalid category:", category);
                              return null;
                            }
                            const isSelected = selectedCategoryIds.includes(category.id);
                            return (
                              <Button
                                key={category.id}
                                type="button"
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                aria-pressed={isSelected}
                                onClick={() => handleCategoryToggle(category.id)}
                                disabled={isSavingCategories}
                              >
                                {category.name || "Unnamed"}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-4 border-b flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">LLM Model Responses</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLLMModal(true)}
                      disabled={!captions.some(c => c.llm_responses && c.llm_responses.length > 0)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Responses (
                      {captions.reduce((total, c) => total + (c.llm_responses?.length || 0), 0)})
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showLLMModal} onOpenChange={setShowLLMModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>LLM Model Responses</DialogTitle>
          </DialogHeader>

          {captions.some(c => c.llm_responses && c.llm_responses.length > 0) ? (
            <>
              <div className="px-6 pb-4">
                <Label className="text-sm font-semibold mb-2 block">Select Caption</Label>
                <Select
                  value={selectedCaptionIndex.toString()}
                  onValueChange={(value) => setSelectedCaptionIndex(parseInt(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {captions.map((caption, index) => {
                      if (!caption.llm_responses || caption.llm_responses.length === 0) return null;

                      const captionText = caption.content?.trim() || "—";
                      const truncatedCaption = captionText.length > 60
                        ? captionText.substring(0, 60) + "..."
                        : captionText;

                      return (
                        <SelectItem key={caption.id} value={index.toString()}>
                          Caption {index + 1}: {truncatedCaption}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="px-6 pb-6">
                {(() => {
                  const selectedCaption = captions[selectedCaptionIndex];

                  if (!selectedCaption || !selectedCaption.llm_responses || selectedCaption.llm_responses.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground italic text-center py-8">
                        No LLM responses for this caption.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4 pb-4">
                      <div className="border-b pb-3">
                        <p className="text-sm font-semibold mb-1">Caption:</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedCaption.content ?? "—"}
                        </p>
                      </div>

                      <div className="space-y-3">
                        {selectedCaption.llm_responses.map((resp: LLMResponse) => (
                          <div
                            key={resp.id}
                            className="space-y-3 rounded-lg border border-border/60 bg-card/80 p-3"
                          >
                            <div className="flex flex-wrap gap-2">
                              <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary font-semibold">
                                Slug: {resp.humor_flavor_slug ?? `Flavor ${resp.humor_flavor_id ?? "—"}`}
                              </span>
                              <span className="px-2 py-1 text-xs rounded-full bg-accent/20 text-accent-foreground font-semibold">
                                Model: {resp.llm_model_name}
                              </span>
                            </div>
                            <pre className="text-sm whitespace-pre-wrap break-words font-sans">
                              {resp.llm_model_response}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </ScrollArea>
            </>
          ) : (
            <div className="text-sm text-muted-foreground italic text-center py-8">
              No LLM responses for this image.
            </div>
          )}
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
