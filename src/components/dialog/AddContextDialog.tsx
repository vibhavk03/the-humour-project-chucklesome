import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CirclePlus, Tag, X } from "lucide-react";
import { useState, useEffect } from "react";
import { CommunitiesService } from "@/services/communities.service";
import { ContextTagsService } from "@/services/context-tags.service";
import CommunityContextTag from "@/types/community-context-tag";

interface AddContextDialogProps {
  selectedCommunity: number | null;
  onContextAdded: () => void;
}

export default function AddContextDialog({
  selectedCommunity,
  onContextAdded,
}: AddContextDialogProps) {
  const [open, setOpen] = useState(false);
  const [contextText, setContextText] = useState("");
  const [allTags, setAllTags] = useState<CommunityContextTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<CommunityContextTag[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [loadingTags, setLoadingTags] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) loadTags();
  }, [open]);

  const loadTags = async () => {
    setLoadingTags(true);
    const tags = await ContextTagsService.getAllTags();
    if (Array.isArray(tags)) setAllTags(tags);
    setLoadingTags(false);
  };

  const toggleTag = (tag: CommunityContextTag) => {
    setSelectedTags((prev) =>
      prev.some((t) => t.id === tag.id)
        ? prev.filter((t) => t.id !== tag.id)
        : [...prev, tag]
    );
  };

  const removeTag = (tagId: number) => {
    setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  const handleSubmit = async () => {
    if (!contextText.trim() || selectedCommunity === null) return;

    try {
      setIsSubmitting(true);
      const contextResponse = await CommunitiesService.addContext(
        selectedCommunity,
        contextText.trim()
      );
      if (!contextResponse || "error" in contextResponse) {
        console.error("Context creation failed:", contextResponse?.error);
        return;
      }

      const contextId = contextResponse.id;
      if (!contextId) return;

      const assignPromises = selectedTags.map((tag) =>
        ContextTagsService.assignTagToContext(contextId, tag.id)
      );

      await Promise.all(assignPromises);
      setContextText("");
      setSelectedTags([]);
      setOpen(false);
      onContextAdded();
    } catch (err) {
      console.error("Failed to assign tags:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={selectedCommunity === null}
          title={
            selectedCommunity === null
              ? "Select a community to add a context."
              : undefined
          }
        >
          <CirclePlus className="mr-2 h-4 w-4" />
          Add New Context
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-4xl p-8">
        <DialogHeader>
          <DialogTitle>Add New Context</DialogTitle>
          <DialogDescription>
            Create a new context for this community and assign tags.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          <div>
            <Textarea
              placeholder="Enter your context here..."
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              className="min-h-[240px]"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="flex items-center gap-1 text-sm font-medium mb-2">
              <Tag className="h-4 w-4" />
              Assign Tags
            </label>

            {/* Selected Tags */}
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedTags.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No tags selected
                </p>
              ) : (
                selectedTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-3 py-1 text-sm
                      bg-primary/10 text-primary rounded-full bg-blue-100 
                      dark:bg-blue-900 text-blue-800 dark:text-blue-100"
                  >
                    {tag.name}
                    <button
                      onClick={() => removeTag(tag.id)}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Tag Selector */}
            <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={loadingTags}
                >
                  {loadingTags
                    ? "Loading tags..."
                    : tagInput || "Search existing tags..."}
                  <Tag className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search tags..."
                    value={tagInput}
                    onValueChange={setTagInput}
                  />

                  <CommandList>
                    <CommandEmpty>
                      No tags found. Create them in the tag manager.
                    </CommandEmpty>

                    <CommandGroup>
                      {allTags
                        .filter(
                          (tag) =>
                            tag.name
                              .toLowerCase()
                              .includes(tagInput.toLowerCase()) &&
                            !selectedTags.some((s) => s.id === tag.id)
                        )
                        .map((tag) => (
                          <CommandItem
                            key={tag.id}
                            onSelect={() => {
                              toggleTag(tag);
                              setTagInput("");
                              setTagPopoverOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            {tag.name}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!contextText.trim() || loadingTags || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                Adding...
              </span>
            ) : (
              "Add Context"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
