"use client";

// import { IconFlame } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { ImageService } from "@/services/images.service";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Category from "@/types/common-use-category";
import { uploadImageFromUrlAction } from "@/app/actions";
import { uploadImageFile } from "@/services/image-file-upload.service";

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function UploadImage({
  selectedCategories,
  onImageUploaded
}: {
  selectedCategories?: Category["id"][],
  onImageUploaded?: (imageId: string) => void
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [imageId, setImageId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => () => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const resetUploader = () => {
    setFiles([]);
    setImageUrl("");
    setImageId(null);
    setImagePreview(null);
  };

  // File handling
  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setFiles(files);
    setIsLoading(true);
    const file = files[0];

    try {
      setImagePreview(URL.createObjectURL(file));
  
      const newImage = await uploadImageFile(file, {
        isCommonUse: !!selectedCategories?.length,
      });
      setImageId(newImage.image.id);

      if (selectedCategories && selectedCategories.length > 0) {
        const mapping_id  = await ImageService.mapImageToCategories(newImage.image.id, selectedCategories);
        if (!mapping_id) {
          console.error("Error mapping image to category");
          toast({
            title: "Error",
            description: "Failed mapping image to category. Please try again.",
          });
          resetUploader();
          return;
        }
        // Mark image as common use
        await ImageService.markAsCommonUse(newImage.image.id);
      }

      // Notify parent about successful upload
      if (onImageUploaded) {
        onImageUploaded(newImage.image.id);
      }

    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Error",
        description: "Failed to upload image. Please try again.",
      });
      resetUploader();
    } finally {
      setIsLoading(false);
    }
  };

  // URL handling
  const handleUrlUpload = async () => {
    if (!isValidUrl(imageUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid image URL.",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { image } = await uploadImageFromUrlAction(imageUrl);

      setImagePreview(image.url);
      setImageId(image.id);

      if (selectedCategories && selectedCategories.length > 0) {
        const mapping_id  = await ImageService.mapImageToCategories(image.id, selectedCategories);
        if (!mapping_id) {
          console.error("Error mapping image to category");
          toast({
            title: "Error",
            description: "Failed mapping image to category. Please try again.",
          });
          resetUploader();
          return;
        }
        // Mark image as common use
        await ImageService.markAsCommonUse(image.id);
      }

      // Notify parent about successful upload
      if (onImageUploaded) {
        onImageUploaded(image.id);
      }

    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Error",
        description: "Failed to upload image. Please try again.",
      });
      resetUploader();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col gap-8 items-center justify-center p-4 relative">
      {isLoading && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <Spinner />
        </div>
      )}
      {!imagePreview && (
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center gap-4 border border-border rounded-lg">
            <FileUpload
              onChange={handleFileUpload}
              accept={{
                "image/*": [".jpg", ".jpeg", ".png", ".webp"],
              }}
              multiple={false}
            />
          </div>
          <div className="my-8">
            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
              <span className="relative z-10 bg-background px-2 text-muted-foreground">
                Or enter a URL
              </span>
            </div>
          </div>
          <div className="flex flex-row items-end gap-3">
            <div className="w-full">
              <Label htmlFor="url">URL</Label>
              <Input
                type="url"
                name="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                required
              />
            </div>
            <div>
              <Button
                type="button"
                onClick={handleUrlUpload}
                disabled={!imageUrl.trim()}
                variant="secondary"
                className="px-4"
              >
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}
      {imagePreview && (
        <>
          <div className="absolute -top-14">
            <Button onClick={resetUploader}>Upload another image</Button>
          </div>
          <Image src={imagePreview} alt="uploaded image" width={100} height={100}/>
        </>
      )}
    </div>
  );
}
