"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
// import { MultiSelectCategoriesDropdown } from "@/components/filter/MultiSelectCategoriesDropdown";
import Category from "@/types/common-use-category";
import { supabase } from "@/utils/supabase/client";
import { ImageService } from "@/services/images.service";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { uploadImageFromUrlAction } from "@/app/actions";
import {
  checkAuthStatusAction
} from "@/app/actions/upload-common-use";
import {
  validateImageFile,
  processFileUploads
} from "@/utils/upload-utils";
import { uploadImageFile } from "@/services/image-file-upload.service";

export default function UploadCommonUsePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedCategories, setSelectedCategories] = useState<Category["id"][]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0, currentFile: "" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [urlFields, setUrlFields] = useState<string[]>([""]);
  const [resetToken, setResetToken] = useState<number | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const canUpload = useMemo(() => selectedCategories.length > 0, [selectedCategories]);

  useEffect(() => {
    const fetchCategories = async () => {
      if (!supabase) return;
      try {
        const response = await supabase.from("common_use_categories").select("*");
        setCategories((response?.data as Category[]) || []);
      } catch (e) {
        console.error("Failed to load categories", e);
      }
    };
    fetchCategories();
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const authStatus = await checkAuthStatusAction();
      setIsAuthenticated(authStatus.isAuthenticated);

      if (authStatus.isAuthenticated) {
        console.log("User is authenticated:", authStatus.userEmail);
      } else {
        console.log("User not authenticated");
      }
    };

    checkAuth();
  }, []);

  const onFilesSelected = (files: File[]) => {
    setLocalFiles((prev) => [...prev, ...files]);
  };

  const addUrlField = () => {
    setUrlFields((prev) => [...prev, ""]);
  };

  const updateUrlField = (index: number, value: string) => {
    setUrlFields((prev) => prev.map((v, i) => (i === index ? value : v)));
  };

  const removeUrlField = (index: number) => {
    setUrlFields((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  };

  const resetPageState = () => {
    setLocalFiles([]);
    setUrlFields([""]);
    setResetToken(Math.random());
    setUploadProgress({ completed: 0, total: 0, currentFile: "" });
  };

  const handleLocalUpload = async () => {
    if (localFiles.length === 0) {
      toast({ title: "No files selected", description: "Please select files to upload." });
      return;
    }

    // Check authentication using server action
    const authStatus = await checkAuthStatusAction();
    if (!authStatus.isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in and try again. If you just logged in, please refresh the page.",
        variant: "destructive"
      });
      return;
    }

    // Validate files before upload
    const { valid: validFiles, invalid: invalidFiles } = await processFileUploads(localFiles);

    if (invalidFiles.length > 0) {
      const errors = invalidFiles.map(({ file, error }) => `${file.name}: ${error}`).join("\n");
      toast({
        title: "Invalid files detected",
        description: errors,
        variant: "destructive"
      });

      // Continue with valid files if any
      if (validFiles.length === 0) {
        return;
      }
    }

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: validFiles.length, currentFile: "" });

    try {
      console.log("Starting upload process with files:", validFiles.map(f => f.name));
      console.log("Selected categories:", selectedCategories);

      const successfulUploads: any[] = [];
      const failedUploads: { file: File; error: string }[] = [];

      // Process uploads with higher concurrency for better speed
      const maxConcurrent = 6; // Increased from 3 to 6 for faster uploads

      // Smart batching - process files continuously
      const uploadQueue = [...validFiles];
      const activeUploads = new Map<string, Promise<any>>();

      const uploadFile = async (file: File) => {
        try {
          // Update current file being uploaded
          setUploadProgress(prev => ({ ...prev, currentFile: file.name }));

          const result = await uploadImageFile(file, {
            isCommonUse: true,
            compressionEnabled: true,
            onProgress: (progress) => {
              console.log(`Upload progress for ${file.name}: ${progress.percentage}%`);
            }
          });

          if (result?.image?.id) {
            // Only map categories - common use marking is already done by server action
            if (selectedCategories.length > 0) {
              try {
                const categoryResult = await ImageService.mapImageToCategories(result.image.id, selectedCategories);

                if (categoryResult && typeof categoryResult === 'object' && 'error' in categoryResult) {
                  console.error("Category mapping failed:", categoryResult.error);
                }
              } catch (dbError) {
                console.error("Category mapping failed for image:", result.image.id, dbError);
                // Don't throw here - image was uploaded successfully, just metadata operations failed
              }
            }

            // Update progress
            setUploadProgress(prev => ({
              ...prev,
              completed: prev.completed + 1,
              currentFile: ""
            }));

            successfulUploads.push(result);
            return result;
          } else {
            throw new Error("No image ID returned from upload");
          }
        } catch (fileError) {
          console.error(`Failed to upload file ${file.name}:`, fileError);
          const errorMessage = fileError instanceof Error ? fileError.message : "Unknown error";
          failedUploads.push({ file, error: errorMessage });

          // Update progress even for failed uploads
          setUploadProgress(prev => ({
            ...prev,
            completed: prev.completed + 1,
            currentFile: ""
          }));

          return null;
        }
      };

      // Smart batching: Start uploads continuously as slots become available
      while (uploadQueue.length > 0 || activeUploads.size > 0) {
        // Start new uploads up to max concurrent limit
        while (uploadQueue.length > 0 && activeUploads.size < maxConcurrent) {
          const file = uploadQueue.shift()!;
          const uploadPromise = uploadFile(file).finally(() => {
            activeUploads.delete(file.name);
          });
          activeUploads.set(file.name, uploadPromise);
        }

        // Wait for at least one upload to complete before checking again
        if (activeUploads.size > 0) {
          await Promise.race(activeUploads.values());
        }
      }

      // Report results
      if (successfulUploads.length > 0) {
        toast({
          title: "Upload complete",
          description: `${successfulUploads.length} of ${validFiles.length} image(s) uploaded successfully.`
        });
      }

      if (failedUploads.length > 0) {
        const errors = failedUploads.map(({ file, error }) => `${file.name}: ${error}`).join("\n");
        toast({
          title: "Some uploads failed",
          description: errors,
          variant: "destructive"
        });
      }

      if (successfulUploads.length > 0) {
        resetPageState();
        router.push("/images");
      }
    } catch (error) {
      console.error("Local upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast({
        title: "Upload failed",
        description: `Error: ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      setUploadProgress({ completed: 0, total: 0, currentFile: "" });
    }
  };

  const handleUrlUpload = async () => {

    const urls = urlFields
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      toast({ title: "No URLs added", description: "Please enter one or more URLs to upload." });
      return;
    }

    // Validate all URLs
    for (const u of urls) {
      try { new URL(u); } catch {
        toast({ title: "Invalid URL", description: `Please fix: ${u}`, variant: "destructive" });
        return;
      }
    }

    // Check authentication using server action
    const authStatus = await checkAuthStatusAction();
    if (!authStatus.isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in and try again. If you just logged in, please refresh the page.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: urls.length, currentFile: "" });

    try {
      console.log("Starting URL upload process with URLs:", urls);
      console.log("Selected categories:", selectedCategories);

      // Upload all URLs in parallel for maximum speed
      const urlUploadPromises = urls.map(async (url) => {
        try {
          // Direct server action upload - fastest method
          const result = await uploadImageFromUrlAction(url, true); // true for isCommonUse
          console.log("URL upload successful:", result?.image?.id);

          if (result?.image?.id) {
            // Only map categories - common use marking is already done by server action
            if (selectedCategories.length > 0) {
              try {
                const categoryResult = await ImageService.mapImageToCategories(result.image.id, selectedCategories);

                if (categoryResult && typeof categoryResult === 'object' && 'error' in categoryResult) {
                  console.error("Category mapping failed:", categoryResult.error);
                }
              } catch (dbError) {
                console.error("Category mapping failed for image:", result.image.id, dbError);
                // Don't throw here - image was uploaded successfully, just metadata operations failed
              }
            }

            // Update progress
            setUploadProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
            return result;
          } else {
            throw new Error("No image ID returned from URL upload");
          }
        } catch (urlError) {
          console.error(`Failed to upload from URL ${url}:`, urlError);
          throw urlError;
        }
      });

      // Wait for all URL uploads to complete
      const results = await Promise.all(urlUploadPromises);
      console.log(`Successfully uploaded ${results.length} URLs`);

      // Validate all uploads succeeded
      const failedUploads = results.filter((result: any) => !result?.image?.id);
      if (failedUploads.length > 0) {
        throw new Error(`${failedUploads.length} URLs failed to upload properly`);
      }
      toast({ title: "Upload complete", description: `${results.length} image URL(s) uploaded.` });
      resetPageState();
      router.push("/images");
    } catch (error) {
      console.error("URL upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast({
        title: "Upload failed",
        description: `Error: ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      setUploadProgress({ completed: 0, total: 0, currentFile: "" });
    }
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="page-title">Upload Images</h1>
        <Button variant="outline" onClick={() => router.push("/images")}>Back</Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 md:col-span-3 lg:col-span-3 xl:col-span-2 h-fit surface-card">
          <h2 className="text-sm font-medium mb-3">Categories</h2>
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
            {categories.map((c) => {
              const checked = selectedCategories.includes(c.id);
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedCategories((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                      );
                    }}
                  />
                  <span>{c.name}</span>
                </label>
              );
            })}
            {categories.length === 0 && (
              <div className="text-xs text-muted-foreground">No categories found</div>
            )}
          </div>
        </aside>
        <section className="col-span-12 md:col-span-9 lg:col-span-9 xl:col-span-10">
          <Tabs defaultValue="local" className="w-full">
            <TabsList>
              <TabsTrigger value="local">Local files</TabsTrigger>
              <TabsTrigger value="url">From URL</TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="mt-4">
              <div className="surface-card">
                <FileUpload
                  onChange={onFilesSelected}
                  accept={{ "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".tiff"] }}
                  multiple
                  resetToken={resetToken}
                />
                {localFiles.length > 0 && (
                  <div className="mt-4 text-sm text-muted-foreground">
                    {localFiles.length} file(s) ready to upload
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Button disabled={isUploading} onClick={handleLocalUpload}>
                    {isUploading
                      ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}…`
                      : "Upload"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setLocalFiles([]); setResetToken(Math.random()); }} disabled={isUploading}>Clear</Button>
                </div>
                {isUploading && uploadProgress.total > 0 && (
                  <div className="mt-2">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {uploadProgress.completed} of {uploadProgress.total} files uploaded
                      {uploadProgress.currentFile && (
                        <span className="block mt-1">Currently uploading: {uploadProgress.currentFile}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4">
              <div className="surface-card space-y-4">
                <div className="space-y-3">
                  {urlFields.map((value, idx) => (
                    <div className="flex gap-2 items-end" key={`url-field-${idx}`}>
                      <div className="w-full">
                        <Label htmlFor={`url-${idx}`}>Image URL {idx + 1}</Label>
                        <Input
                          id={`url-${idx}`}
                          value={value}
                          onChange={(e) => updateUrlField(idx, e.target.value)}
                          placeholder="https://example.com/image.jpg"
                        />
                      </div>
                      <Button type="button" variant="ghost" onClick={() => removeUrlField(idx)} disabled={isUploading}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={addUrlField} disabled={isUploading} className="gap-2">
                    <Plus className="h-4 w-4" /> Add URL field
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button disabled={isUploading} onClick={handleUrlUpload}>
                    {isUploading
                      ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}…`
                      : "Upload"}
                  </Button>
                  <Button variant="ghost" onClick={() => setUrlFields([""])} disabled={isUploading}>Clear</Button>
                </div>
                {isUploading && uploadProgress.total > 0 && (
                  <div className="mt-2">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {uploadProgress.completed} of {uploadProgress.total} URLs uploaded
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
