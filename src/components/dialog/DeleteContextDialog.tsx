import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { CommunitiesService } from "@/services/communities.service";
import Context from "@/types/context";

interface DeleteContextDialogProps {
  context: Context;
  onContextDeleted: () => void;
}

export default function DeleteContextDialog({ 
  context,
  onContextDeleted
}: DeleteContextDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteContext = async () => {
    setIsDeleting(true);
    const response = await CommunitiesService.deleteContextById(context.id);
    
    if (response && 'error' in response) {
      console.error('Error deleting context:', response.error);
    } else {
      console.log('Context deleted successfully');
      onContextDeleted(); // Refresh the contexts list
    }
    
    setIsDeleting(false);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80 hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Context</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this context? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-muted text-foreground p-3 rounded my-4 text-sm">
          {(context.content ?? "").length > 100
            ? (context.content ?? "").substring(0, 100) + "..."
            : context.content ?? ""}
        </div>
        
        <DialogFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)}
          >
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDeleteContext}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 
