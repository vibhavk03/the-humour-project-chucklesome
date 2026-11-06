"use client"

import * as React from "react";
import { Check, ChevronsUpDown, ArrowUpDown } from "lucide-react";

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
import { useState } from "react";

export function UsersFilter({ 
  setFilter, 
}: { 
  setFilter: (filter: string) => void, 
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const filters = [
    "Name (A-Z)",
    "Name (Z-A)",
    "Date Created (Newest)",
    "Date Created (Oldest)",
    "Recently Active",
    "Email (A-Z)",
    "Email (Z-A)",
  ]

  const handleFilterSelect = (filter: string) => {
    setValue(filter);
    setFilter(filter); // Pass filter selection to parent
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

          <span className="flex items-center gap-2">
            {(value || "Name (A-Z)") && <ArrowUpDown className="w-4 h-4 opacity-70" />}
            {value
              ? filters.find((filter) => filter === value)
              : "Name (A-Z)"}
            </span>      
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Search filters..." />
            <CommandList>
              <CommandEmpty>No filter found.</CommandEmpty>
              <CommandGroup>
                {filters.map((filter, index) => (
                  <CommandItem
                    key={index}
                    value={filter}
                    onSelect={() => handleFilterSelect(filter)}
                  >
                    {filter}
                    <Check
                      className={cn(
                        "ml-auto",
                        value === filter ? "opacity-100" : "opacity-0"
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
