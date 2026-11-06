import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { CommunitiesService } from "@/services/communities.service";
import Context from "@/types/context";

interface EditContextDialogProps {
  context: Context;
  onContextUpdated: () => void;
}

export default function EditContextDialog({ 
  context,
  onContextUpdated
}: EditContextDialogProps) {
  const [inputText, setInputText] = useState(context.content ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateContext = async () => {
    if (inputText.trim()) {
      try {
        setIsUpdating(true);
        const response = await CommunitiesService.updateContextById(context.id, inputText);
        if (response && 'error' in response) {
          console.error('Error updating context:', response.error);
        } else {
          console.log('Context updated successfully');
          setIsOpen(false);
          onContextUpdated(); // Refresh the contexts list
        }
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Context</DialogTitle>
          <DialogDescription>
            Update the content of this context.
          </DialogDescription>
        </DialogHeader>
        <Textarea 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="min-h-[150px]"
        />
        <Button onClick={handleUpdateContext} disabled={isUpdating}>
          {isUpdating ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
              Saving...
            </span>
          ) : (
            "Save Changes"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
} 
