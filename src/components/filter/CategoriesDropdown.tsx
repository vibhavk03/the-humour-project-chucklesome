"use client"

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

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
import { supabase } from "@/utils/supabase/client";
import Category from "@/types/common-use-category";
import { CategoriesService } from "@/services/categories.service";
import { Input } from "@/components/ui/input";
import { Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast"

export function CategoriesDropdown({ 
  setSelectedCategory, 
  setSelectedCategoryName 
}: { 
  setSelectedCategory: (categoryId: Category["id"]) => void, 
  setSelectedCategoryName: (categoryName: string) => void 
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const { toast } = useToast();

  // Fetch categories from Supabase
  useEffect(() => {
    const fetchCategories = async () => {
      if (!supabase) return;
      
      try {
        const response = await supabase.from("common_use_categories").select("*");
        setCategories(response?.data as Category[] || []);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };

    fetchCategories();
  }, []);

  const handleCategorySelect = (categoryId: Category["id"], categoryName: string) => {
    setValue(categoryName);
    setSelectedCategory(categoryId); // Pass category ID to parent
    setSelectedCategoryName(categoryName); // Pass category name to parent
    setOpen(false);
  };

  // Function to add a new category
  const handleAddCategory = async () => {
    if (!supabase || !newCategory.trim()) return;
    
    try {
      const newCategoryData = await CategoriesService.createCategory(newCategory.trim());
      if (newCategoryData) {
        setCategories((prev) => [...prev, newCategoryData]); 
        setNewCategory("");
        setIsDialogOpen(false);
        toast({
          title: "Category Added",
          description: `Category "${newCategoryData.name}" has been added.`,
        });
      } else {
        throw new Error("Failed to add category");
      }
    } catch (error) {
      console.error("Error adding category:", error);
      toast({
        title: "Error",
        description: "Failed to add category.",
        variant: "destructive",
      });
    }
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
            {value
              ? categories.find((category) => category.name === value)?.name
              : "Select category..."}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Search categories..." />
            <CommandList>
              <CommandEmpty>No category found.</CommandEmpty>
              <CommandGroup>
                {categories.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={category.name ?? "Untitled"}
                    onSelect={() => handleCategorySelect(category.id, category.name ?? "Untitled")}
                  >
                    {category.name ?? "Untitled"}
                    <Check
                      className={cn(
                        "ml-auto",
                        value === (category.name ?? "Untitled") ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
                {/* Add Category Button */}
                <CommandItem
                  onSelect={() => setIsDialogOpen(true)}
                  className="text-primary flex items-center cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Category
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Add Category Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
          </DialogHeader>
          <Input
            type="text"
            placeholder="Enter category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <DialogFooter>
            <Button onClick={handleAddCategory}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
