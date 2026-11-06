"use client"

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
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { HumorFlavor } from "@/types/humor-flavor";
import { HumorFlavorsService } from "@/services/humor-flavors.service";

export function HumorFlavorsDropdown({
  setSelectedFlavorId,
  setSelectedFlavorSlug,
  initialSelectedFlavorId,
  allowViewAll = true,
}: {
  setSelectedFlavorId: (id: HumorFlavor["id"] | null) => void;
  setSelectedFlavorSlug: (slug: HumorFlavor["slug"] | string) => void;
  initialSelectedFlavorId?: number;
  allowViewAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("All");
  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFlavors = async () => {
      const data = await HumorFlavorsService.getAll();
      if (!Array.isArray(data)) {
        toast({
          title: "Error",
          description: "Failed to get humor flavors.",
          variant: "destructive",
        });
        return;
      }
      setFlavors(data);

      // If an explicit initial flavor is provided, prefer it
      if (initialSelectedFlavorId) {
        const match = data.find(f => f.id === initialSelectedFlavorId);
        if (match) {
          setValue(match.slug);
          setSelectedFlavorId(match.id);
          setSelectedFlavorSlug(match.slug);
        }
      }
      // Otherwise, leave parent selection as-is (e.g., All)
    };
    fetchFlavors();
  }, [toast, setSelectedFlavorId, setSelectedFlavorSlug, initialSelectedFlavorId]);

  const handleSelect = (flavor: HumorFlavor) => {
    setValue(flavor.slug);
    setSelectedFlavorId(flavor.id);
    setSelectedFlavorSlug(flavor.slug);
    setOpen(false);
  };

  const handleSelectAll = () => {
    setValue("All");
    setSelectedFlavorId(null);
    setSelectedFlavorSlug("All");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
        >
          {value || "All"}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search humor flavors..." />
          <CommandList>
            <CommandEmpty>No flavor found.</CommandEmpty>
            <CommandGroup>
              {allowViewAll && (
                <CommandItem key="__all__" value="All" onSelect={handleSelectAll}>
                  All
                  <Check
                    className={cn(
                      "ml-auto",
                      value === "All" ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              )}
              {flavors.map((flavor) => (
                <CommandItem
                  key={flavor.id}
                  value={flavor.slug}
                  onSelect={() => handleSelect(flavor)}
                >
                  {flavor.slug}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === flavor.slug ? "opacity-100" : "opacity-0"
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
