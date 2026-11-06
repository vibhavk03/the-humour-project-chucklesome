"use client"

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
import { useMemo, useState } from "react";
import Community from "@/types/community";

type CommunitiesDropdownProps = {
  communities: Community[];
  selectedCommunityId: Community["id"] | null;
  onSelectCommunity: (communityId: Community["id"] | null) => void;
};

export function CommunitiesDropdown({
  communities,
  selectedCommunityId,
  onSelectCommunity,
}: CommunitiesDropdownProps) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const arr = [...communities].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "")
    );
    return arr;
  }, [communities]);

  const selectedCommunity = communities.find(
    (community) => community.id === selectedCommunityId
  );

  const handleCommunitySelect = (communityId: Community["id"] | null) => {
    onSelectCommunity(communityId);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[200px] justify-between"
          >
            {selectedCommunity
              ? selectedCommunity.name ?? "Unnamed community"
              : "Filter by communities..."}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Search communities..." />
            <CommandList>
              <CommandEmpty>No community found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="All communities"
                  onSelect={() => handleCommunitySelect(null)}
                >
                  All communities
                  <Check
                    className={cn(
                      "ml-auto",
                      selectedCommunityId === null ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              </CommandGroup>
              <CommandGroup>
                {filtered.map((community) => (
                  <CommandItem
                    key={community.id}
                    value={community.name ?? ""}
                    onSelect={() => handleCommunitySelect(community.id)}
                  >
                    {community.name ?? "Unnamed community"}
                    <Check
                      className={cn(
                        "ml-auto",
                        selectedCommunityId === community.id
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
    </>
  );
}
