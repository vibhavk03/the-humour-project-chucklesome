import {
  Drawer,
  DrawerTitle,
  DrawerDescription,
  DrawerContent,
} from "@/components/ui/drawer";
import { UploadImage } from "@/components/button/UploadImage";
import Category from "@/types/common-use-category";

interface IUploadImageDrawer {
  open: boolean;
  onClose: () => void;
  selectedCategories: Category["id"][];
  onImageUploaded?: (imageId: string) => void;
}

export default function UplaodImageDrawer({
  open,
  onClose,
  selectedCategories,
  onImageUploaded
}: IUploadImageDrawer) {

  const handleImageUploaded = (imageId: string) => {
    if (onImageUploaded) {
      onImageUploaded(imageId);
    }
    // Close the drawer after successful upload
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerTitle></DrawerTitle>
      <DrawerDescription></DrawerDescription>
      <DrawerContent className="items-center p-20">
        <div className="flex flex-row gap-10 p-10">
          <UploadImage 
            selectedCategories={selectedCategories} 
            onImageUploaded={handleImageUploaded}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}