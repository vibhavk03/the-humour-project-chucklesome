"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { ContextTagsService } from "@/services/context-tags.service";
import type CommunityContextTag from "@/types/community-context-tag";

export default function CommunityContextTagsPage() {
  const [tags, setTags] = useState<CommunityContextTag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchTags = async () => {
    setIsLoading(true);
    const response = await ContextTagsService.getAllTags();
    if (Array.isArray(response)) {
      setTags(response);
    } else {
      console.error("Error fetching tags:", response?.error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void fetchTags();
  }, []);

  const handleAddTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed || isSavingNew) return;
    setErrorMessage("");
    setIsSavingNew(true);
    const response = await ContextTagsService.addTag(trimmed);
    if (response && "error" in response) {
      setErrorMessage(response.error);
    } else {
      setNewTagName("");
      await fetchTags();
    }
    setIsSavingNew(false);
  };

  const handleStartEdit = (tag: CommunityContextTag) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
  };

  const handleSaveEdit = async () => {
    if (editingTagId === null || !editingTagName.trim()) return;
    const response = await ContextTagsService.updateTag(editingTagId, editingTagName.trim());
    if (response && !("error" in response)) {
      setEditingTagId(null);
      setEditingTagName("");
      await fetchTags();
    } else {
      console.error("Error updating tag:", response);
    }
  };

  const handleCancelEdit = () => {
    setEditingTagId(null);
    setEditingTagName("");
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm("Are you sure you want to delete this tag? It will be removed from all contexts.")) {
      return;
    }
    const response = await ContextTagsService.deleteTag(tagId);
    if (response && "success" in response) {
      await fetchTags();
    } else {
      console.error("Error deleting tag:", response);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Community Context Tags</h1>
        <p className="page-subtitle">
          Create and manage tags that can be assigned to contexts for image matching.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="New tag name (e.g., sports, animals, food)"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleAddTag();
              }
            }}
            disabled={isSavingNew}
          />
          <Button onClick={handleAddTag} disabled={!newTagName.trim() || isSavingNew}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">{isSavingNew ? "Adding..." : "Add"}</span>
          </Button>
        </div>

        {errorMessage && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
            {errorMessage}
          </div>
        )}

        <div className="border border-border rounded-md p-4 bg-muted/40">
          <h3 className="text-sm font-semibold mb-3 text-foreground">
            Existing Tags ({tags.length})
          </h3>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tags...</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No tags yet. Create one above!
            </p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-2 bg-card rounded border border-border"
                >
                  {editingTagId === tag.id ? (
                    <>
                      <Input
                        value={editingTagName}
                        onChange={(e) => setEditingTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void handleSaveEdit();
                          } else if (e.key === "Escape") {
                            handleCancelEdit();
                          }
                        }}
                        className="flex-1 mr-2"
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleSaveEdit}
                          className="text-primary hover:text-primary/80"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleCancelEdit}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{tag.name}</span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartEdit(tag)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTag(tag.id)}
                          className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
