"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Plus, Edit2, Trash2, Save, X } from "lucide-react";
import { HumorService } from "@/services/humor.service";
import HumorTheme from "@/types/humor-theme";
import HumorFlavor from "@/types/humor-flavor";
import { toast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function HumorManagement() {
  const [themes, setThemes] = useState<HumorTheme[]>([]);
  const [flavors, setFlavors] = useState<HumorFlavor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Theme form state
  const [editingTheme, setEditingTheme] = useState<HumorTheme | null>(null);
  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeDescription, setNewThemeDescription] = useState("");
  
  // Flavor form state
  const [editingFlavor, setEditingFlavor] = useState<HumorFlavor | null>(null);
  const [newFlavorName, setNewFlavorName] = useState("");
  const [newFlavorDescription, setNewFlavorDescription] = useState("");
  const [selectedThemeIds, setSelectedThemeIds] = useState<number[]>([]);
  
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'theme' | 'flavor', item: any } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [themesData, flavorsData] = await Promise.all([
        HumorService.getAllThemes(),
        HumorService.getAllFlavors()
      ]);
      setThemes(themesData);
      setFlavors(flavorsData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load humor themes and flavors",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Theme management functions
  const handleSaveTheme = async () => {
    if (!newThemeName.trim()) {
      toast({
        title: "Error",
        description: "Theme name is required",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      if (editingTheme) {
        const success = await HumorService.updateTheme(
          editingTheme.id,
          newThemeName,
          newThemeDescription
        );
        if (success) {
          toast({ title: "Success", description: "Theme updated successfully" });
          await loadData();
        }
      } else {
        const newTheme = await HumorService.createTheme(newThemeName, newThemeDescription);
        if (newTheme) {
          toast({ title: "Success", description: "Theme created successfully" });
          await loadData();
        }
      }
      resetThemeForm();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save theme",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTheme = (theme: HumorTheme) => {
    setEditingTheme(theme);
    setNewThemeName(theme.name ?? "");
    setNewThemeDescription(theme.description || "");
  };

  const handleDeleteTheme = async (theme: HumorTheme) => {
    setDeleteTarget({ type: 'theme', item: theme });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    setIsLoading(true);
    try {
      if (deleteTarget.type === 'theme') {
        const success = await HumorService.deleteTheme(deleteTarget.item.id);
        if (success) {
          toast({ title: "Success", description: "Theme deleted successfully" });
          await loadData();
        }
      } else {
        const success = await HumorService.deleteFlavor(deleteTarget.item.id);
        if (success) {
          toast({ title: "Success", description: "Flavor deleted successfully" });
          await loadData();
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete ${deleteTarget.type}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setDeleteTarget(null);
    }
  };

  const resetThemeForm = () => {
    setEditingTheme(null);
    setNewThemeName("");
    setNewThemeDescription("");
  };

  // Flavor management functions
  const handleSaveFlavor = async () => {
    if (!newFlavorName.trim()) {
      toast({
        title: "Error",
        description: "Flavor slug is required",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      if (editingFlavor) {
        const success = await HumorService.updateFlavor(
          editingFlavor.id,
          newFlavorName,
          newFlavorDescription,
          selectedThemeIds
        );
        if (success) {
          toast({ title: "Success", description: "Flavor updated successfully" });
          await loadData();
        }
      } else {
        const newFlavor = await HumorService.createFlavor(
          newFlavorName,
          newFlavorDescription,
          selectedThemeIds
        );
        if (newFlavor) {
          toast({ title: "Success", description: "Flavor created successfully" });
          await loadData();
        }
      }
      resetFlavorForm();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save flavor",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditFlavor = (flavor: HumorFlavor) => {
    setEditingFlavor(flavor);
    setNewFlavorName(flavor.slug || "");
    setNewFlavorDescription(flavor.description || "");
    setSelectedThemeIds(flavor.theme_ids || []);
  };

  const handleDeleteFlavor = async (flavor: HumorFlavor) => {
    setDeleteTarget({ type: 'flavor', item: flavor });
  };

  const resetFlavorForm = () => {
    setEditingFlavor(null);
    setNewFlavorName("");
    setNewFlavorDescription("");
    setSelectedThemeIds([]);
  };

  const toggleThemeSelection = (themeId: number) => {
    setSelectedThemeIds(prev => 
      prev.includes(themeId) 
        ? prev.filter(id => id !== themeId)
        : [...prev, themeId]
    );
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Humor Management</h1>
        <p className="page-subtitle">Create, edit, and organize humor themes and flavors.</p>
      </div>
      
      <Tabs defaultValue="themes" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="themes">Humor Themes</TabsTrigger>
          <TabsTrigger value="flavors">Humor Flavors</TabsTrigger>
        </TabsList>
        
        <TabsContent value="themes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{editingTheme ? 'Edit Theme' : 'Create New Theme'}</CardTitle>
              <CardDescription>
                Themes are broad categories of humor (e.g., &quot;Sarcastic&quot;, &quot;Wholesome&quot;)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme-name">Theme Name</Label>
                <Input
                  id="theme-name"
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
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveTheme} disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  {editingTheme ? 'Update' : 'Create'} Theme
                </Button>
                {editingTheme && (
                  <Button variant="outline" onClick={resetThemeForm}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Existing Themes</CardTitle>
              <CardDescription>
                {themes.length} theme{themes.length !== 1 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {themes.map((theme) => (
                  <div key={theme.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h3 className="font-medium">{theme.name ?? "Untitled"}</h3>
                      {theme.description && (
                        <p className="text-sm text-muted-foreground">{theme.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditTheme(theme)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTheme(theme)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {themes.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No themes created yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="flavors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{editingFlavor ? 'Edit Flavor' : 'Create New Flavor'}</CardTitle>
              <CardDescription>
                Flavors are specific types of humor that can belong to multiple themes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="flavor-name">Flavor Slug</Label>
                <Input
                  id="flavor-name"
                  placeholder="Enter flavor slug"
                  value={newFlavorName}
                  onChange={(e) => setNewFlavorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flavor-description">Description (Optional)</Label>
                <Textarea
                  id="flavor-description"
                  placeholder="Enter flavor description"
                  value={newFlavorDescription}
                  onChange={(e) => setNewFlavorDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Assign to Themes</Label>
                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  {themes.map((theme) => (
                    <div key={theme.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`theme-${theme.id}`}
                        checked={selectedThemeIds.includes(theme.id)}
                        onCheckedChange={() => toggleThemeSelection(theme.id)}
                      />
                      <Label
                        htmlFor={`theme-${theme.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {theme.name ?? "Untitled"}
                      </Label>
                    </div>
                  ))}
                  {themes.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Create themes first to assign flavors
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveFlavor} disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  {editingFlavor ? 'Update' : 'Create'} Flavor
                </Button>
                {editingFlavor && (
                  <Button variant="outline" onClick={resetFlavorForm}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Existing Flavors</CardTitle>
              <CardDescription>
                {flavors.length} flavor{flavors.length !== 1 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {flavors.map((flavor) => (
                  <div key={flavor.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-medium">{flavor.slug}</h3>
                      {flavor.description && (
                        <p className="text-sm text-muted-foreground">{flavor.description}</p>
                      )}
                      {flavor.theme_ids && flavor.theme_ids.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {flavor.theme_ids.map(themeId => {
                            const theme = themes.find(t => t.id === themeId);
                            return theme ? (
                              <Badge key={themeId} variant="secondary" className="text-xs">
                                {theme.name ?? "Untitled"}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditFlavor(flavor)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFlavor(flavor)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {flavors.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No flavors created yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {deleteTarget?.type} &quot;{deleteTarget?.item.name}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
