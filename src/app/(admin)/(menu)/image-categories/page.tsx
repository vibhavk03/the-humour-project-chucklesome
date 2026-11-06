"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2, Search, Folder } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CategoriesService } from "@/services/categories.service";
import Category from "@/types/common-use-category";
import AddCategoryDialog from "@/components/dialog/AddCategoryDialog";
import EditCategoryDialog from "@/components/dialog/EditCategoryDialog";
import DeleteCategoryDialog from "@/components/dialog/DeleteCategoryDialog";
import { useTimeZone } from "@/components/TimeZoneContext";

export default function ImageCategoriesPage() {
  const { timeZone } = useTimeZone();
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  
  const { toast } = useToast();

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await CategoriesService.getAllCategories();
      setCategories(data);
      setFilteredCategories(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load categories",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Filter categories based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredCategories(categories);
    } else {
      const filtered = categories.filter((category) => {
        const name = category.name ?? "";
        return name.toLowerCase().includes(searchTerm.toLowerCase());
      });
      setFilteredCategories(filtered);
    }
  }, [searchTerm, categories]);

  const handleAddSuccess = (newCategory: Category) => {
    setCategories(prev => [...prev, newCategory]);
    setFilteredCategories(prev => [...prev, newCategory]);
  };

  const handleEditSuccess = (updatedCategory: Category) => {
    setCategories(prev => 
      prev.map(cat => cat.id === updatedCategory.id ? updatedCategory : cat)
    );
    setFilteredCategories(prev => 
      prev.map(cat => cat.id === updatedCategory.id ? updatedCategory : cat)
    );
  };

  const handleDeleteSuccess = () => {
    if (selectedCategory) {
      setCategories(prev => prev.filter(cat => cat.id !== selectedCategory.id));
      setFilteredCategories(prev => prev.filter(cat => cat.id !== selectedCategory.id));
      setSelectedCategory(null);
    }
  };

  const handleEditClick = (category: Category) => {
    setSelectedCategory(category);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (category: Category) => {
    setSelectedCategory(category);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="page-shell">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4">
        <div className="page-header">
          <h1 className="page-title">Image Categories</h1>
          <p className="page-subtitle">Manage categories for organizing images.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 min-w-[260px]"
            />
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
      </div>

      <Separator />

      {filteredCategories.length === 0 ? (
        <Card className="p-6">
          <CardHeader className="p-0">
            <CardTitle>No categories found</CardTitle>
            <CardDescription>
              {searchTerm ? "Try adjusting your search" : "Create your first category to get started"}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="min-w-full table-base">
            <thead className="table-head">
              <tr>
                <th>Id</th>
                <th>Name</th>
                <th>Created</th>
                <th>Modified</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredCategories.map((category) => (
                <tr key={category.id}>
                  <td className="whitespace-nowrap font-sans text-muted-foreground">
                    {category.id}
                  </td>
                  <td className="font-medium">{category.name ?? "Untitled"}</td>
                  <td className="text-muted-foreground">
                    {new Date(category.created_datetime_utc).toLocaleDateString("en-US", {
                      timeZone,
                    })}
                  </td>
                  <td className="text-muted-foreground">
                    {category.modified_datetime_utc
                      ? new Date(category.modified_datetime_utc).toLocaleDateString("en-US", {
                          timeZone,
                        })
                      : "—"}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(category)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(category)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <AddCategoryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />

      <EditCategoryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        category={selectedCategory}
        onSuccess={handleEditSuccess}
      />

      <DeleteCategoryDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        category={selectedCategory}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}
