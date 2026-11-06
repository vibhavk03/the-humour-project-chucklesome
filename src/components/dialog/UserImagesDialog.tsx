import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserService } from "@/services/users.service";
import { useEffect, useState } from "react";
import UserImage from "@/types/userImage";
import { ScrollArea } from "@/components/ui/scroll-area";
import ImageCardSimple from "@/components/card/ImageCardSimple";
import ImageDetailDialog from "@/components/dialog/ImageDetailDialog";

interface IUserImagesDialog {
  open: boolean;
  onClose: () => void;
  user_id: string;
}

export default function UserImagesDialog({ open, onClose, user_id }: IUserImagesDialog) {
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<UserImage | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    const fetchUserImages = async () => {
      setIsLoading(true);
      try {
        const userImages = await UserService.getUserImagesById(user_id);
        setImages(userImages || []);
      } catch (error) {
        console.error("Error fetching user images:", error);
        setImages([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      fetchUserImages();
    }
  }, [open, user_id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">User Images</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {images.length} {images.length === 1 ? 'image' : 'images'} found
          </p>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 py-6">
              {images.length > 0 ? (
                images.map((image) => (
                  <div 
                    key={image.id} 
                    className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedImage(image);
                      setDetailDialogOpen(true);
                    }}
                  >
                    <ImageCardSimple image={image} />
                  </div>
                ))
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-muted-foreground">No images found for this user</p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
      
      {/* Image Detail Dialog */}
      <ImageDetailDialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        image={selectedImage}
        images={images}
        onNavigate={(image) => setSelectedImage(image)}
      />
    </Dialog>
  );
}