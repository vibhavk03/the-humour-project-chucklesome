import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tag, X } from "lucide-react";
import { useState, useEffect } from "react";
import { ContextTagsService } from "@/services/context-tags.service";
import CommunityContextTag from "@/types/community-context-tag";
import Context from "@/types/context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AssignContextTagsDialogProps {
  context: Context;
  onTagsUpdated: () => void;
}

export default function AssignContextTagsDialog({
  context,
  onTagsUpdated,
}: AssignContextTagsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [allTags, setAllTags] = useState<CommunityContextTag[]>([]);
  const [assignedTags, setAssignedTags] = useState<any[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, context.id]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch all available tags
    const allTagsResponse = await ContextTagsService.getAllTags();
    if (Array.isArray(allTagsResponse)) {
      setAllTags(allTagsResponse);
    }
    
    // Fetch assigned tags for this context
    const assignedTagsResponse = await ContextTagsService.getTagsForContext(context.id);
    if (Array.isArray(assignedTagsResponse)) {
      setAssignedTags(assignedTagsResponse);
    }
    
    setIsLoading(false);
  };

  const handleAssignTag = async () => {
    if (selectedTagId) {
      const tagId = parseInt(selectedTagId);
      const response = await ContextTagsService.assignTagToContext(context.id, tagId);
      
      if (response && !('error' in response)) {
        setSelectedTagId("");
        fetchData();
        onTagsUpdated();
      } else {
        console.error("Error assigning tag:", response);
      }
    }
  };

  const handleRemoveTag = async (mappingId: number) => {
    const response = await ContextTagsService.removeTagFromContext(mappingId);
    
    if (response && 'success' in response) {
      fetchData();
      onTagsUpdated();
    } else {
      console.error("Error removing tag:", response);
    }
  };

  // Get available tags (not yet assigned)
  const availableTags = allTags.filter(
    (tag) => !assignedTags.some((assigned) => assigned.id === tag.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Tag className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Context Tags</DialogTitle>
          <DialogDescription>
            Assign tags to this context for better image matching.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            {/* Currently assigned tags */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Assigned Tags</h3>
              {assignedTags.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No tags assigned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignedTags.map((tag) => (
                    <div
                      key={tag.mapping_id}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded-full text-sm"
                    >
                      <span>{tag.name}</span>
                      <button
                        onClick={() => handleRemoveTag(tag.mapping_id)}
                        className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assign new tag */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Add Tag</h3>
              {availableTags.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  All available tags have been assigned. Create more tags in &quot;Manage Context Tags&quot;.
                </p>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedTagId} onValueChange={setSelectedTagId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a tag to assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id.toString()}>
                          {tag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAssignTag} disabled={!selectedTagId}>
                    Assign
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
