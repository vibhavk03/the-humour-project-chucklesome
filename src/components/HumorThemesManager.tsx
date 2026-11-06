"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, Trash2, Plus, X, Check, Search } from "lucide-react";
import { HumorService } from "@/services/humor.service";
import HumorTheme from "@/types/humor-theme";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type HumorThemesManagerProps = {
  onThemesUpdated?: () => void;
  active?: boolean;
  className?: string;
  addThemeMode?: "inline" | "modal";
};

export default function HumorThemesManager({
  onThemesUpdated,
  active = true,
  className,
  addThemeMode = "inline",
}: HumorThemesManagerProps) {
  const [themes, setThemes] = useState<HumorTheme[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeDescription, setNewThemeDescription] = useState("");
  const [editingTheme, setEditingTheme] = useState<HumorTheme | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleAddDialogOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      setNewThemeName("");
      setNewThemeDescription("");
    }
  };

  const fetchThemes = async () => {
    setIsLoading(true);
    try {
      const data = await HumorService.getAllThemes();
      setThemes(data || []);
    } catch (error) {
      console.error("Error fetching themes:", error);
      toast({
        title: "Error",
        description: "Failed to load themes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!active) {
      setSearchTerm("");
      setNewThemeName("");
      setNewThemeDescription("");
      setEditingTheme(null);
      setEditingName("");
      setEditingDescription("");
      setIsAddDialogOpen(false);
      setThemes([]);
      setIsLoading(false);
      setIsSaving(false);
      return;
    }

    fetchThemes();
  }, [active]);

  const filteredThemes = useMemo(() => {
    if (!searchTerm.trim()) return themes;
    const s = searchTerm.toLowerCase();
    return themes.filter((theme) => {
      const themeName = theme.name ?? "";
      return (
        themeName.toLowerCase().includes(s) ||
        theme.description?.toLowerCase().includes(s)
      );
    });
  }, [themes, searchTerm]);

  const handleAddTheme = async () => {
    if (!newThemeName.trim()) {
      toast({
        title: "Error",
        description: "Theme name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const newTheme = await HumorService.createTheme(
        newThemeName.trim(),
        newThemeDescription.trim() || undefined
      );
      if (newTheme) {
        toast({ title: "Success", description: "Theme created successfully" });
        await fetchThemes();
        setNewThemeName("");
        setNewThemeDescription("");
        onThemesUpdated?.();
        if (addThemeMode === "modal") {
          setIsAddDialogOpen(false);
        }
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to create theme",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (theme: HumorTheme) => {
    setEditingTheme(theme);
    setEditingName(theme.name ?? "");
    setEditingDescription(theme.description || "");
  };

  const handleSaveEdit = async () => {
    if (!editingTheme || !editingName.trim()) return;

    setIsSaving(true);
    try {
      const success = await HumorService.updateTheme(
        editingTheme.id,
        editingName.trim(),
        editingDescription.trim() || undefined
      );
      if (success) {
        toast({ title: "Success", description: "Theme updated successfully" });
        await fetchThemes();
        setEditingTheme(null);
        setEditingName("");
        setEditingDescription("");
        onThemesUpdated?.();
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to update theme",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingTheme(null);
    setEditingName("");
    setEditingDescription("");
  };

  const handleDeleteTheme = async (theme: HumorTheme) => {
    const label = theme.name ?? "Untitled";
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setIsSaving(true);
    try {
      const success = await HumorService.deleteTheme(theme.id);
      if (success) {
        toast({ title: "Success", description: "Theme deleted successfully" });
        await fetchThemes();
        onThemesUpdated?.();
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete theme",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderAddThemeForm = (showCancel: boolean) => (
    <div className="space-y-2">
      <div>
        <Label htmlFor="new-theme-name">Name</Label>
        <Input
          id="new-theme-name"
          placeholder="Enter theme name"
          value={newThemeName}
          onChange={(e) => setNewThemeName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newThemeName.trim()) {
              handleAddTheme();
            }
          }}
        />
      </div>
      <div>
        <Label htmlFor="new-theme-description">Description (Optional)</Label>
        <Textarea
          id="new-theme-description"
          placeholder="Enter theme description"
          value={newThemeDescription}
          onChange={(e) => setNewThemeDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className={cn("flex gap-2", showCancel ? "justify-end" : "")}>
        {showCancel && (
          <Button
            variant="outline"
            onClick={() => handleAddDialogOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
        )}
        <Button onClick={handleAddTheme} disabled={!newThemeName.trim() || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add Theme
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search themes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {addThemeMode === "modal" && (
          <Dialog open={isAddDialogOpen} onOpenChange={handleAddDialogOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add New Theme
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Theme</DialogTitle>
                <DialogDescription>
                  Create a new theme to organize humor flavors.
                </DialogDescription>
              </DialogHeader>
              {renderAddThemeForm(true)}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {addThemeMode === "inline" && (
        <div className="border border-border rounded-md p-4 bg-muted/40 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Add New Theme
          </h3>
          {renderAddThemeForm(false)}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Existing Themes</h3>
          <span className="text-sm text-muted-foreground">{filteredThemes.length}</span>
        </div>
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="min-w-full table-base">
            <thead className="table-head">
              <tr>
                <th>Id</th>
                <th>Name</th>
                <th>Description</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : filteredThemes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground">
                    {searchTerm
                      ? "No themes found matching your search"
                      : "No themes yet. Create one above!"}
                  </td>
                </tr>
              ) : (
                filteredThemes.map((theme) => (
                  <tr key={theme.id}>
                    {editingTheme?.id === theme.id ? (
                      <>
                        <td className="whitespace-nowrap font-sans text-muted-foreground">
                          {theme.id}
                        </td>
                        <td className="align-top">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingName.trim()) {
                                handleSaveEdit();
                              } else if (e.key === "Escape") {
                                handleCancelEdit();
                              }
                            }}
                            placeholder="Theme name"
                            autoFocus
                          />
                        </td>
                        <td className="align-top">
                          <Textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            placeholder="Description (optional)"
                            rows={2}
                          />
                        </td>
                        <td className="text-right align-top">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleSaveEdit}
                              disabled={!editingName.trim() || isSaving}
                              className="text-green-600 hover:text-green-700"
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap font-sans text-muted-foreground">
                          {theme.id}
                        </td>
                        <td className="font-medium">{theme.name ?? "Untitled"}</td>
                        <td className="text-muted-foreground">
                          {theme.description || "—"}
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleStartEdit(theme)}
                              disabled={isSaving}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTheme(theme)}
                              disabled={isSaving}
                              className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
