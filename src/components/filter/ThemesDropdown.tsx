"use client"

import * as React from "react";
import {
  Check,
  ChevronsUpDown,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";

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
import { useEffect, useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast"
import HumorTheme from "@/types/humor-theme";
import { HumorService } from "@/services/humor.service";

export function ThemesDropdown({ 
  setSelectedTheme, 
  setSelectedThemeName 
}: { 
  setSelectedTheme: (themeId: HumorTheme["id"] | null) => void, 
  setSelectedThemeName: (themeName: string) => void 
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [themes, setThemes] = useState<HumorTheme[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeDescription, setNewThemeDescription] = useState("");
  const { toast } = useToast();

  const refreshThemes = useCallback(async () => {
    try {
      const res = await HumorService.getAllThemes();
      setThemes(res || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get themes.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    void refreshThemes();
  }, [refreshThemes]);

  const handleThemeSelect = (themeId: HumorTheme["id"] | null, themeName: string) => {
    if (themeId === null) {
      setValue("All Themes");
      setSelectedTheme(null);
      setSelectedThemeName("All Themes");
    } else {
      setValue(themeName);
      setSelectedTheme(themeId);
      setSelectedThemeName(themeName);
    }
    setOpen(false);
  };

  const handleAddTheme = async () => {
    if (!newThemeName.trim()) return;

    const newTheme = await HumorService.createTheme(newThemeName.trim(), newThemeDescription.trim() || undefined);
    if (!newTheme) {
      toast({
        title: "Error",
        description: "Failed to add theme.",
        variant: "destructive",
      });
    } else {
      await refreshThemes();
      setNewThemeName("");
      setNewThemeDescription("");
      setIsDialogOpen(false);
      const themeName = newTheme.name ?? newThemeName.trim();
      toast({
        title: "Theme Added",
        description: `Theme "${themeName}" has been added.`,
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = [...themes].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return q ? arr.filter((t) => (t.name ?? "").toLowerCase().includes(q)) : arr;
  }, [themes, search]);

  const startRename = (t: HumorTheme) => {
    setEditingId(t.id);
    setEditingName(t.name ?? "");
    setEditingDescription(t.description || "");
  };
  
  const cancelRename = () => {
    setEditingId(null);
    setEditingName("");
    setEditingDescription("");
  };
  
  const saveRename = async () => {
    if (!editingId || !editingName.trim()) return;
    const success = await HumorService.updateTheme(editingId, editingName.trim(), editingDescription.trim() || undefined);
    if (!success) {
      toast({
        title: "Rename failed",
        description: "Failed to update theme.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Renamed",
        description: `Theme renamed to "${editingName}".`,
      });
      await refreshThemes();
      if (value && editingId) {
        const wasSelected = themes.find((t) => t.id === editingId && t.name === value);
        if (wasSelected) {
          setValue(editingName);
          setSelectedThemeName(editingName);
        }
      }
      cancelRename();
    }
  };
  
  const deleteTheme = async (t: HumorTheme) => {
    const themeName = t.name ?? "Untitled";
    const ok = window.confirm(`Delete "${themeName}"? This cannot be undone.`);
    if (!ok) return;
    const success = await HumorService.deleteTheme(t.id);
    if (!success) {
      toast({
        title: "Delete failed",
        description: "Failed to delete theme.",
        variant: "destructive",
      });
    } else {
      await refreshThemes();
      if (value === themeName) {
        setValue("");
        setSelectedTheme(null);
        setSelectedThemeName("");
      }
      toast({ title: "Deleted", description: `"${themeName}" removed.` });
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
            {value || "Select theme..."}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command shouldFilter={true} filter={(value, search) => {
            if (!search) return 1;
            const searchLower = search.toLowerCase();
            const valueLower = value.toLowerCase();
            // Check if search matches the value or if it's a special command
            if (valueLower.includes(searchLower) || valueLower === "all themes" || valueLower.includes("add") || valueLower.includes("manage")) {
              return 1;
            }
            return 0;
          }}>
            <CommandInput placeholder="Search themes by name or description..." />
            <CommandList>
              <CommandEmpty>No theme found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all themes"
                  onSelect={() => handleThemeSelect(null, "All Themes")}
                  className="text-primary"
                >
                  All Themes
                  <Check
                    className={cn(
                      "ml-auto",
                      value === "All Themes" || !value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
                {themes.map((theme) => {
                  // Create a searchable value that includes both name and description
                  const themeName = theme.name ?? "Untitled";
                  const searchableValue = `${themeName} ${theme.description || ""}`.toLowerCase();
                  return (
                    <CommandItem
                      key={theme.id}
                      value={searchableValue}
                      onSelect={() => handleThemeSelect(theme.id, themeName)}
                    >
                      <div className="flex flex-col">
                        <span>{themeName}</span>
                        {theme.description && (
                          <span className="text-xs text-muted-foreground">{theme.description}</span>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "ml-auto",
                          value === themeName ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  );
                })}
                {/* Add Theme Button */}
                <CommandItem
                  value="add theme"
                  onSelect={() => setIsDialogOpen(true)}
                  className="text-primary flex items-center cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Theme
                </CommandItem>
                {/* Humor Themes */}
                <CommandItem
                  value="manage themes"
                  onSelect={() => setManageOpen(true)}
                  className="flex items-center cursor-pointer"
                >
                  <MoreVertical className="mr-2 h-4 w-4" />
                  Humor Themes
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Add Theme Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Theme</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="theme-name">Theme Name</Label>
              <Input
                id="theme-name"
                type="text"
                placeholder="Enter theme name"
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="theme-description">Description (Optional)</Label>
              <Textarea
                id="theme-description"
                placeholder="Enter theme description"
                value={newThemeDescription}
                onChange={(e) => setNewThemeDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTheme}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Humor Themes</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Search themes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No themes</div>
              ) : (
                filtered.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 p-2">
                    {editingId === t.id ? (
                      <>
                        <div className="flex-1 space-y-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            autoFocus
                          />
                          <Textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            placeholder="Description (optional)"
                            rows={2}
                          />
                        </div>
                        <Button size="sm" onClick={saveRename}>
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelRename}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="font-medium">{t.name}</div>
                          {t.description && (
                            <div className="text-sm text-muted-foreground">{t.description}</div>
                          )}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => startRename(t)}>
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteTheme(t)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
