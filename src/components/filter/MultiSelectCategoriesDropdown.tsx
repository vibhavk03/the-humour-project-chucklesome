"use client"

import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";

export function MultiSelectCategoriesDropdown({ 
  selectedCategories,
  setSelectedCategories,
  showAddCategory = true,
}: { 
  selectedCategories: Category["id"][], 
  setSelectedCategories: (categoryIds: Category["id"][]) => void;
  showAddCategory?: boolean;
}) {
  const [open, setOpen] = useState(false);
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

  const handleCategoryToggle = (categoryId: Category["id"]) => {
    setSelectedCategories(
      selectedCategories.includes(categoryId)
        ? selectedCategories.filter(id => id !== categoryId)
        : [...selectedCategories, categoryId]
    );
  };

  const handleRemoveCategory = (categoryId: Category["id"]) => {
    setSelectedCategories(selectedCategories.filter(id => id !== categoryId));
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

  const getSelectedCategoryNames = () => {
    return categories
      .filter(category => selectedCategories.includes(category.id))
      .map(category => category.name);
  };

  return (
    <>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="justify-between"
            >
              {selectedCategories.length > 0
                ? `${selectedCategories.length} categories selected`
                : "Select categories..."}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0">
            <Command>
              <CommandInput placeholder="Search categories..." />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => (
                    <CommandItem
                      key={category.id}
                      value={category.name ?? "Untitled"}
                      onSelect={() => handleCategoryToggle(category.id)}
                    >
                      {category.name ?? "Untitled"}
                      <Check
                        className={cn(
                          "ml-auto",
                          selectedCategories.includes(category.id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                  {showAddCategory && (
                    <CommandItem
                      onSelect={() => setIsDialogOpen(true)}
                      className="text-primary flex items-center cursor-pointer"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Category
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Selected categories as simple tags */}
        {selectedCategories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {categories
              .filter(category => selectedCategories.includes(category.id))
              .map((category) => (
                <span 
                  key={category.id} 
                  className="inline-flex items-center px-2 py-1 text-xs font-medium bg-muted text-foreground rounded-md"
                >
                  {category.name ?? "Untitled"}
                  <X 
                    className="ml-1 h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" 
                    onClick={() => handleRemoveCategory(category.id)}
                  />
                </span>
              ))
            }
          </div>
        )}
      </div>

      {showAddCategory && (
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
      )}
    </>
  );
}
