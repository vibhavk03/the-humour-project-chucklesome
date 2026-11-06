import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { type CarouselApi } from "@/components/ui/carousel";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Captions } from "@/types/captions";
import { CaptionService } from "@/services/captions.service";
import { UserService } from "@/services/users.service";
import { Trash2, X } from "lucide-react";
import { deleteImageAction } from "@/app/actions/delete-image";
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
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { propagateServerField } from "next/dist/server/lib/render-server";

interface IImageDrawer {
  open: boolean;
  onClose: () => void;
  created: string;
  url: string;
  user_id: string;
  image_id: string;
  isCommonUse?: boolean;
  onImageDeleted?: (imageId: string) => void;
  additional_context?: string | null;
  showAdditionalContextEditor?: boolean;
  onSaveAdditionalContext?: (imageID: string, value: string) => Promise<boolean>;
}

interface UserProfile {
  first_name: string;
  last_name: string;
}

export default function ImageDrawer({
  open,
  onClose,
  url,
  user_id,
  image_id,
  isCommonUse = false,
  onImageDeleted,
  additional_context,
  showAdditionalContextEditor,
  onSaveAdditionalContext
}: IImageDrawer) {

  const [captions, setCaptions] = useState<Captions[]>([]);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [name, setName] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [additionalContext, setAdditionalContext] = useState<string>('');
  const [isSavingContext, setIsSavingContext] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setAdditionalContext(additional_context ?? "");
    }
  }, [open, additional_context]);

  useEffect(() => {
    const fetchData = async () => {
      const captions = await CaptionService.getCaptionsByImageId(image_id);
      const name = await UserService.getNameById(user_id) as UserProfile[];

      if (Array.isArray(name) && name.length > 0) {
        const userName = name[0];
        const hasFirstName = userName.first_name?.trim();
        const hasLastName = userName.last_name?.trim();

        let displayName: string;

        if (hasFirstName) {
          displayName = hasLastName ? `${hasFirstName} ${hasLastName}` : hasFirstName;
        } else if (hasLastName) {
          displayName = hasLastName;
        } else {
          const emailData = await UserService.getUserEmailsById(user_id);
          displayName = emailData[0]?.email?.trim() || "Anonymous User";
        }
        setName(displayName);
      } else {
        setName("Anonymous User");
      }

      setCaptions(captions);
    };

    fetchData();
  }, [image_id, user_id]);

  useEffect(() => {
    if (!carouselApi) {
      return;
    }

    const onSelect = () => setCurrentIndex(carouselApi.selectedScrollSnap());
    onSelect(); // init

    carouselApi.on("select", onSelect);
    carouselApi.on("reInit", onSelect);

    return () => {
      carouselApi.off("select", onSelect);
      carouselApi.off("reInit", onSelect);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (currentIndex >= captions.length) setCurrentIndex(0);
  }, [captions.length, currentIndex]);

  const handleDelete = async () => {
    if (!isCommonUse) return;

    setIsDeleting(true);
    try {
      const result = await deleteImageAction(image_id as string);
      if (!result.success) {
        console.error(result.error);
      } else {
        // Close both dialogs
        setDeleteDialogOpen(false);
        onClose();

        // Call the callback to update parent component
        if (onImageDeleted) {
          onImageDeleted(image_id as string);
        }

        // Refresh the page to update the image list
        router.refresh();
      }
    } catch (error) {
      console.error("Error deleting image:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onClose}>
        <DrawerContent className="max-h-[95vh] flex flex-col p-0">
          <DrawerHeader className="flex justify-between items-center relative">
            <div>
              <DrawerTitle>Image {image_id}</DrawerTitle>
              <DrawerDescription>Uploaded by {name}</DrawerDescription>
            </div>
            <div className="flex gap-2">
              {isCommonUse && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="h-8 w-8"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <DrawerClose asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Close drawer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex flex-col gap-4 items-center justify-center">
              <Image
                src={url}
                alt={image_id}
                width={600}
                height={600}
                className="h-auto w-full max-w-[90vw] max-h-[65vh] object-contain md:max-w-2xl"
              />
              {captions.length > 0 ? (
                <>
                  <Carousel className="w-full max-w-xs sm:max-w-sm md:max-w-md" setApi={setCarouselApi}>
                    <CarouselContent>
                      {captions.map((caption) => (
                        <CarouselItem
                          key={caption.id}
                          className="text-left text-foreground mt-4 space-y-4"
                        >
                          <div className="text-lg font-medium text-center">{caption.content}</div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>

                  {/* LLM responses for the current caption */}
                  <div className="w-full md:max-w-2xl mt-4">
                    <h3 className="text-lg font-semibold mb-4 text-center">Model Responses</h3>

                    {captions[currentIndex]?.llm_responses?.length ? (
                      <div className="space-y-3">
                        {captions[currentIndex]!.llm_responses!.map((resp: any) => (
                          <div
                            key={resp.id}
                            className="space-y-3 rounded-lg border border-border/60 bg-card/80 p-3"
                          >
                            {/* Pills row */}
                            <div className="flex flex-wrap gap-2">
                              <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary font-semibold">
                                Slug: {resp.humor_flavor_slug ?? `Flavor ${resp.humor_flavor_id ?? "—"}`}
                              </span>
                              <span className="px-2 py-1 text-xs rounded-full bg-accent/20 text-accent-foreground font-semibold">
                                Model: {resp.llm_model_name}
                              </span>
                            </div>

                            {/* Response text */}
                            <pre className="text-sm whitespace-pre-wrap font-sans">
                              {resp.llm_model_response}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic text-center">
                        No LLM responses for this caption.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs">No captions available for this image.</p>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                Click X button, press ESC, or click outside to close
              </p>
            </div>
          </div>
          {showAdditionalContextEditor && (
            <div className="border-t bg-background p-6">
              <div className="mx-auto w-full md:max-w-2xl">
                <label className="text-sm font-semibold block mb-2">Additional Context</label>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  rows={4}
                  placeholder="Describe the context in which this photo was taken."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  disabled={isSavingContext}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!onSaveAdditionalContext) return;
                      setIsSavingContext(true);
                      await onSaveAdditionalContext(String(image_id), additionalContext);
                      setIsSavingContext(false);
                    }}
                    disabled={isSavingContext}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

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
