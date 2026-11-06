"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTimeZone } from "@/components/TimeZoneContext";
import { ImageHumorPotentialPromptsService } from "@/services/image-humor-potential-prompts.service";
import { LlmService } from "@/services/llm.service";
import ImageHumorPotentialPrompt from "@/types/image-humor-potential-prompt";
import LlmModel from "@/types/llm-model";
import AddImageHumorPotentialPromptDialog from "@/components/dialog/AddImageHumorPotentialPromptDialog";
import EditImageHumorPotentialPromptDialog from "@/components/dialog/EditImageHumorPotentialPromptDialog";
import DeleteImageHumorPotentialPromptDialog from "@/components/dialog/DeleteImageHumorPotentialPromptDialog";

type SortMode = "newest" | "oldest" | "az" | "za";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "A–Z" },
  { value: "za", label: "Z–A" },
];

function truncate(text: string | null, maxLength: number) {
  if (!text) return "No description";
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length === 0) return "No description";
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine;
}

export default function ImageHumorPotentialPromptsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { timeZone } = useTimeZone();

  const [prompts, setPrompts] = useState<ImageHumorPotentialPrompt[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<ImageHumorPotentialPrompt | null>(null);
  const [deletingPrompt, setDeletingPrompt] = useState<ImageHumorPotentialPrompt | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [promptsData, modelsData] = await Promise.all([
        ImageHumorPotentialPromptsService.getAll(),
        LlmService.getAllModels(),
      ]);
      setPrompts(promptsData);
      setModels(modelsData);
    } catch (error) {
      console.error("Failed to fetch humor potential prompts:", error);
      toast({ title: "Failed to load prompts", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const modelsById = useMemo(() => {
    return Object.fromEntries(models.map((model) => [model.id, model]));
  }, [models]);

  const visiblePrompts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? prompts.filter((prompt) => prompt.name.toLowerCase().includes(query))
      : prompts;

    return [...filtered].sort((a, b) => {
      if (sortMode === "az") return a.name.localeCompare(b.name);
      if (sortMode === "za") return b.name.localeCompare(a.name);
      const aTime = new Date(a.created_datetime_utc).getTime();
      const bTime = new Date(b.created_datetime_utc).getTime();
      return sortMode === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [prompts, search, sortMode]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone,
    });
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Humor Potential Prompts</h1>
          <p className="page-subtitle">
            Named prompts the scoring pipeline can load by id instead of using hardcoded
            defaults.
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New prompt
        </Button>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {SORT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={sortMode === option.value ? "default" : "outline"}
                  onClick={() => setSortMode(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="table-shell">
            <div className="overflow-x-auto">
              <table className="min-w-full table-base">
                <thead className="table-head">
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Model</th>
                    <th>Temperature</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading prompts...</p>
                      </td>
                    </tr>
                  ) : visiblePrompts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        {search
                          ? "No prompts match your search."
                          : "No prompts yet. Create your first one to get started."}
                      </td>
                    </tr>
                  ) : (
                    visiblePrompts.map((prompt) => {
                      const model = modelsById[prompt.llm_model_id];
                      return (
                        <tr
                          key={prompt.id}
                          className="hover:bg-muted/50 transition-colors animate-in fade-in-0 cursor-pointer"
                          onClick={() =>
                            router.push(`/image-humor-potential-prompts/${prompt.id}`)
                          }
                        >
                          <td className="font-medium whitespace-nowrap">{prompt.name}</td>
                          <td className="text-muted-foreground max-w-[320px] truncate">
                            {truncate(prompt.description, 80)}
                          </td>
                          <td className="whitespace-nowrap">
                            <Badge variant="secondary" className="font-sans">
                              {model?.name ?? `Model ${prompt.llm_model_id}`}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap">
                            <Badge variant="outline" className="font-sans">
                              {prompt.llm_temperature}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap text-muted-foreground">
                            {formatDate(prompt.created_datetime_utc)}
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditingPrompt(prompt);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeletingPrompt(prompt);
                                }}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddImageHumorPotentialPromptDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={refresh}
      />
      <EditImageHumorPotentialPromptDialog
        prompt={editingPrompt}
        onOpenChange={() => setEditingPrompt(null)}
        onSuccess={refresh}
      />
      <DeleteImageHumorPotentialPromptDialog
        prompt={deletingPrompt}
        onOpenChange={() => setDeletingPrompt(null)}
        onSuccess={refresh}
      />
    </div>
  );
}
