"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger
} from "@/components/ui/sheet";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { HumorService } from "@/services/humor.service";
import { HumorFlavorsService } from "@/services/humor-flavors.service";
import type HumorFlavor from "@/types/humor-flavor";
import type HumorTheme from "@/types/humor-theme";
import { Loader2, Save, Sparkles, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlavorThemesSheetProps {
  trigger?: React.ReactNode;
  onUpdate?: () => void;
}

export default function FlavorThemesSheet({ trigger, onUpdate }: FlavorThemesSheetProps) {
  const [open, setOpen] = useState(false);
  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [themes, setThemes] = useState<HumorTheme[]>([]);
  const [selectedFlavorId, setSelectedFlavorId] = useState("");
  const [selectedThemeIds, setSelectedThemeIds] = useState<number[]>([]);
  const [originalThemeIds, setOriginalThemeIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTheme, setSearchTheme] = useState("");

  useEffect(() => {
    if (open) {
      loadData();
    } else {
      setSelectedFlavorId("");
      setSelectedThemeIds([]);
      setOriginalThemeIds([]);
      setSearchTheme("");
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [flavorsData, themesData] = await Promise.all([
        HumorFlavorsService.getAll(),
        HumorService.getAllThemes()
      ]);
      setFlavors(flavorsData || []);
      setThemes(themesData || []);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedFlavorId || !open) return;
    
    const loadThemeAssignments = async () => {
      try {
        const themeIds = await HumorService.getThemesByFlavorId(Number(selectedFlavorId));
        setSelectedThemeIds(themeIds);
        setOriginalThemeIds(themeIds);
      } catch {
        setSelectedThemeIds([]);
        setOriginalThemeIds([]);
      }
    };
    
    loadThemeAssignments();
  }, [selectedFlavorId, open]);

  const handleThemeToggle = (themeId: number) => {
    setSelectedThemeIds(prev => 
      prev.includes(themeId) 
        ? prev.filter(id => id !== themeId)
        : [...prev, themeId]
    );
  };

  const handleSave = async () => {
    if (!selectedFlavorId) {
      toast({
        title: "Error",
        description: "Please select a flavor first",
        variant: "destructive"
      });
      return;
    }

    // Validate we have valid theme IDs
    const validThemeIds = selectedThemeIds.filter(id => 
      typeof id === 'number' && id > 0
    );

    setIsSaving(true);
    try {
      const success = await HumorService.assignThemesToFlavor(
        Number(selectedFlavorId), 
        validThemeIds
      );
      
      if (success) {
        toast({
          title: "Success",
          description: `Successfully assigned ${validThemeIds.length} theme${validThemeIds.length !== 1 ? 's' : ''} to the flavor`,
        });
        setOriginalThemeIds(validThemeIds);
        onUpdate?.();
        setTimeout(() => setOpen(false), 500);
      } else {
        toast({
          title: "Error",
          description: "Failed to save theme assignments. Please try again.",
          variant: "destructive"
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredThemes = themes.filter(theme => {
    if (!searchTheme) return true;
    const search = searchTheme.toLowerCase();
    const themeName = theme.name ?? "";
    return themeName.toLowerCase().includes(search) ||
           theme.description?.toLowerCase().includes(search);
  });

  const hasChanges = JSON.stringify([...selectedThemeIds].sort()) !== 
                     JSON.stringify([...originalThemeIds].sort());

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Sparkles className="mr-2 h-4 w-4" />
            Flavor Themes
          </Button>
        )}
      </SheetTrigger>
      
      <SheetContent className="flex flex-col h-full sm:max-w-xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle>Assign Flavors to Themes</SheetTitle>
          <SheetDescription>
            Select a flavor and assign it to themes
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="flavor">Select Flavor</Label>
              <Select 
                value={selectedFlavorId} 
                onValueChange={setSelectedFlavorId}
                disabled={isLoading || isSaving}
              >
                <SelectTrigger id="flavor">
                  <SelectValue placeholder="Choose a flavor..." />
                </SelectTrigger>
                <SelectContent>
                  {flavors.map(flavor => (
                    <SelectItem key={flavor.id} value={flavor.id.toString()}>
                      {flavor.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedFlavorId && (
              <>
                <div>
                  <Label>Assign to Themes</Label>
                  <p className="text-sm text-muted-foreground">
                    Select themes for this flavor
                  </p>
                </div>
                
                {themes.length > 0 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search themes..."
                      value={searchTheme}
                      onChange={(e) => setSearchTheme(e.target.value)}
                      className="pl-10"
                    />
                    {searchTheme && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1 h-8 w-8 p-0"
                        onClick={() => setSearchTheme("")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
                
                <ScrollArea className="h-[300px] border rounded-lg p-3">
                  {filteredThemes.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      {searchTheme ? "No themes found" : "No themes available"}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredThemes.map(theme => {
                        const isSelected = selectedThemeIds.includes(theme.id);
                        return (
                          <label
                            key={theme.id}
                            className={cn(
                              "flex items-start space-x-3 p-3 rounded-md cursor-pointer",
                              isSelected ? "bg-primary/10" : "hover:bg-muted"
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleThemeToggle(theme.id)}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{theme.name ?? "Untitled"}</div>
                              {theme.description && (
                                <p className="text-xs text-muted-foreground">
                                  {theme.description}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {selectedThemeIds.length} selected
                  </span>
                  {hasChanges && (
                    <Badge variant="outline">Unsaved changes</Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex justify-between">
            {selectedFlavorId && hasChanges && (
              <Button 
                variant="ghost"
                onClick={() => {
                  setSelectedThemeIds(originalThemeIds);
                  setSearchTheme("");
                }}
              >
                Reset
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {selectedFlavorId && (
                <Button 
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
