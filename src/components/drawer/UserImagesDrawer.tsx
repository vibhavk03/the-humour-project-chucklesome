import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { UserService } from "@/services/users.service";
import { useEffect, useState } from "react";
import UserImage from "@/types/userImage";
import { ScrollArea } from "@/components/ui/scroll-area";
import ImageCard from "@/components/card/ImageCard";

interface IUserImagesDrawer {
  open: boolean;
  onClose: () => void;
  user_id: string; // Pass the user ID to fetch their images
}

export default function UserImagesDrawer({ open, onClose, user_id }: IUserImagesDrawer) {
  const [images, setImages] = useState<UserImage[]>([]); // Adjust type as necessary

  useEffect(() => {
    const fetchUserImages = async () => {
      const userImages = await UserService.getUserImagesById(user_id);
      setImages(userImages || []);
    };

    if (open) {
      fetchUserImages();
    }
  }, [open, user_id]);

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>User Images</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="h-[70vh] px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 py-4">
            {images.length > 0 ? (
              images.map((image) => (
                <div key={image.id} className="border rounded-lg overflow-hidden shadow-md cursor-pointer">
                  <ImageCard image={image} />
                </div>
              ))
            ) : (
              <p className="text-center col-span-full p-4 text-muted-foreground">No images found for this user</p>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
