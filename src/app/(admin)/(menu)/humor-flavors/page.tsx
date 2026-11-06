"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { HumorFlavor } from "@/types/humor-flavor";
import HumorTheme from "@/types/humor-theme";
import { HumorService } from "@/services/humor.service";
import AddHumorFlavorDialog from "@/components/dialog/AddHumorFlavorDialog";
import EditHumorFlavorDialog from "@/components/dialog/EditHumorFlavorDialog";
import DeleteHumorFlavorDialog from "@/components/dialog/DeleteHumorFlavorDialog";
import DuplicateHumorFlavorDialog from "@/components/dialog/DuplicateHumorFlavorDialog";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

export default function HumorFlavorsPage() {
  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [loadingFlavors, setLoadingFlavors] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingFlavor, setEditingFlavor] = useState<HumorFlavor | null>(null);
  const [deletingFlavor, setDeletingFlavor] = useState<HumorFlavor | null>(null);
  const [duplicatingFlavor, setDuplicatingFlavor] = useState<HumorFlavor | null>(null);

  // Theme management states (for filter dropdown only)
  const [themes, setThemes] = useState<HumorTheme[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);

  // Theme filter for flavors
  const [selectedThemeFilter, setSelectedThemeFilter] = useState<string>("all");
  const [selectedThemeFilterName, setSelectedThemeFilterName] = useState<string>("All Themes");
  const [themeFilterOpen, setThemeFilterOpen] = useState(false);

  const { toast } = useToast();

  const refreshFlavors = useCallback(async () => {
    setLoadingFlavors(true);
    try {
      const data = await HumorService.getAllFlavors();
      const sortedData = data.sort((a, b) => new Date(b.created_datetime_utc).getTime() - new Date(a.created_datetime_utc).getTime());
      setFlavors(sortedData);
    } catch (error) {
      console.error("Failed to fetch humor flavors:", error);
      toast({ title: "Failed to load flavors", variant: "destructive" });
    } finally {
      setLoadingFlavors(false);
    }
  }, [toast]);

  const refreshThemes = useCallback(async () => {
    setLoadingThemes(true);
    try {
      const data = await HumorService.getAllThemes();
      setThemes(data || []);
    } catch (error) {
      console.error("Failed to fetch themes:", error);
      toast({ title: "Failed to load themes", variant: "destructive" });
    } finally {
      setLoadingThemes(false);
    }
  }, [toast]);

  useEffect(() => {
    refreshFlavors();
    refreshThemes();
  }, [refreshFlavors, refreshThemes]);

  const filteredFlavors = useMemo(() => {
    if (selectedThemeFilter === "all") return flavors;

    const themeId = Number(selectedThemeFilter);
    if (isNaN(themeId)) return flavors;

    return flavors.filter(flavor => {
      const themeIds = flavor.theme_ids || [];
      return themeIds.includes(themeId);
    });
  }, [flavors, selectedThemeFilter]);

  const themesById = useMemo(() => {
    return Object.fromEntries(themes.map((theme) => [theme.id, theme]));
  }, [themes]);

  const handleThemeFilterSelect = (themeId: string, themeName: string) => {
    setSelectedThemeFilter(themeId);
    setSelectedThemeFilterName(themeName);
    setThemeFilterOpen(false);
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Humor Flavors</h1>
        <p className="page-subtitle">Organize flavor definitions and step sequences.</p>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
              <Popover open={themeFilterOpen} onOpenChange={setThemeFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={themeFilterOpen}
                    className="min-w-[220px] justify-between"
                    disabled={loadingFlavors || loadingThemes}
                  >
                    {selectedThemeFilterName}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command shouldFilter={true} filter={(value, search) => {
                    if (!search) return 1;
                    const searchLower = search.toLowerCase();
                    const valueLower = value.toLowerCase();
                    if (valueLower.includes(searchLower) || valueLower === "all themes") {
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
                          onSelect={() => handleThemeFilterSelect("all", "All Themes")}
                          className="text-primary"
                        >
                          All Themes
                          <Check
                            className={cn(
                              "ml-auto",
                              selectedThemeFilter === "all" ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                        {themes.map((theme) => {
                          const themeName = theme.name ?? "Untitled";
                          const searchableValue = `${themeName} ${theme.description || ""}`.toLowerCase();
                          return (
                            <CommandItem
                              key={theme.id}
                              value={searchableValue}
                              onSelect={() => handleThemeFilterSelect(theme.id.toString(), themeName)}
                            >
                              <div className="flex flex-col flex-1">
                                <span>{themeName}</span>
                                {theme.description && (
                                  <span className="text-xs text-muted-foreground">{theme.description}</span>
                                )}
                              </div>
                              <Check
                                className={cn(
                                  "ml-auto",
                                  selectedThemeFilter === theme.id.toString() ? "opacity-100" : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedThemeFilter !== "all" && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Clear theme filter"
                  onClick={() => {
                    setSelectedThemeFilter("all");
                    setSelectedThemeFilterName("All Themes");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button onClick={() => setIsAddDialogOpen(true)}>Add New Flavor</Button>
            </div>
          </div>
          {loadingFlavors ? (
            <p>Loading...</p>
          ) : filteredFlavors.length === 0 ? (
            <Card className="p-6">
              <CardHeader className="p-0">
                <CardTitle>No flavors found</CardTitle>
                <CardDescription>
                  {selectedThemeFilter !== "all"
                    ? "No flavors found for the selected theme. Try selecting a different theme or view all flavors."
                    : "No flavors available. Add your first flavor to get started."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="bg-card rounded-lg border overflow-hidden">
              <table className="min-w-full table-base">
                <thead className="table-head">
                  <tr>
                    <th>Id</th>
                    <th>Slug</th>
                    <th>Description</th>
                    <th>Themes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredFlavors.map((flavor) => {
                    const assignedThemeIds = flavor.theme_ids || [];
                    const assignedThemes = assignedThemeIds
                      .map((themeId) => themesById[themeId])
                      .filter((theme): theme is HumorTheme => Boolean(theme));
                    return (
                      <tr key={flavor.id}>
                        <td className="whitespace-nowrap font-sans text-muted-foreground">{flavor.id}</td>
                        <td className="whitespace-nowrap font-sans">{flavor.slug}</td>
                        <td>{flavor.description}</td>
                        <td>
                          {assignedThemes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {assignedThemes.map(theme => (
                                <span
                                  key={theme.id}
                                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary"
                                >
                                  {theme.name ?? "Untitled"}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No themes</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right font-medium">
                          <Button variant="link" className="mr-2" asChild>
                            <Link href={`/humor-flavor/${flavor.id}/steps`}>Manage Steps</Link>
                          </Button>
                          <Button variant="link" className="mr-2" onClick={() => setDuplicatingFlavor(flavor)}>Duplicate</Button>
                          <Button variant="link" className="mr-2" onClick={() => setEditingFlavor(flavor)}>Edit</Button>
                          <Button variant="link" className="text-red-600" onClick={() => setDeletingFlavor(flavor)}>Delete</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <AddHumorFlavorDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSuccess={refreshFlavors} />
          <EditHumorFlavorDialog
            flavor={editingFlavor}
            onOpenChange={() => setEditingFlavor(null)}
            onSuccess={() => {
              refreshFlavors();
            }}
          />
          <DuplicateHumorFlavorDialog
            flavor={duplicatingFlavor}
            onOpenChange={() => setDuplicatingFlavor(null)}
            onSuccess={refreshFlavors}
          />
          <DeleteHumorFlavorDialog flavor={deletingFlavor} onOpenChange={() => setDeletingFlavor(null)} onSuccess={refreshFlavors} />
      </div>
    </div>
  );
}
