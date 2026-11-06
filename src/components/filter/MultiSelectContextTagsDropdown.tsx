"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

import CommunityContextTag from "@/types/community-context-tag";

type MultiSelectContextTagsDropdownProps = {
  allTags: CommunityContextTag[];
  selectedTagIds: number[];
  setSelectedTagIds: (ids: number[]) => void;
};

export function MultiSelectContextTagsDropdown({
  allTags,
  selectedTagIds,
  setSelectedTagIds,
}: MultiSelectContextTagsDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between"
        >
          {selectedTagIds.length > 0
            ? `${selectedTagIds.length} tags selected`
            : "Filter by tags..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search tags..." />
          <CommandList>
            <CommandEmpty>No tag found.</CommandEmpty>
            <CommandGroup>
              {allTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.name}
                  onSelect={() => handleToggleTag(tag.id)}
                >
                  {tag.name}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      selectedTagIds.includes(tag.id)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
