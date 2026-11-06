"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Save, Search, Trash2, X } from "lucide-react";
import Community from "@/types/community";
import { CommunitiesService } from "@/services/communities.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTimeZone } from "@/components/TimeZoneContext";

type ServiceError = { error: string };

const isServiceError = (value: unknown): value is ServiceError => {
  return value !== null && typeof value === "object" && "error" in value;
};

const formatDate = (value: unknown, timeZone: string) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  });
};

export default function CommunitiesPage() {
  const { timeZone } = useTimeZone();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const { toast } = useToast();

  const refreshCommunities = async () => {
    setIsLoading(true);
    const res = await CommunitiesService.getAllCommunities();
    if (Array.isArray(res)) {
      setCommunities(res);
    } else {
      setCommunities([]);
      toast({
        title: "Error",
        description: (res as any)?.error || "Failed to fetch communities.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void refreshCommunities();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...communities].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "")
    );
    if (!q) return sorted;
    return sorted.filter((community) => {
      return (
        (community.name ?? "").toLowerCase().includes(q) ||
        String(community.id).includes(q)
      );
    });
  }, [communities, searchQuery]);

  const handleAddCommunity = async () => {
    if (!newCommunityName.trim()) return;
    const res = await CommunitiesService.addCommunity(newCommunityName.trim());
    if (!res || isServiceError(res)) {
      toast({
        title: "Error",
        description: res?.error || "Failed to add community.",
        variant: "destructive",
      });
      return;
    }
    setCommunities((prev) => [...prev, res]);
    setNewCommunityName("");
    setIsAddOpen(false);
    toast({
      title: "Community Added",
      description: `Community "${res.name}" has been added.`,
    });
  };

  const startEdit = (community: Community) => {
    setEditingId(community.id);
    setEditingName(community.name ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    const res = await CommunitiesService.renameCommunity(
      editingId,
      editingName.trim()
    );
    if (!res || isServiceError(res)) {
      toast({
        title: "Rename failed",
        description: res?.error || "Failed to rename community.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Renamed",
      description: `Community renamed to "${res.name}".`,
    });
    await refreshCommunities();
    cancelEdit();
  };

  const deleteCommunity = async (community: Community) => {
    const ok = window.confirm(
      `Delete "${community.name}"? This cannot be undone.`
    );
    if (!ok) return;
    const res = await CommunitiesService.deleteCommunity(community.id);
    if (isServiceError(res)) {
      toast({
        title: "Delete failed",
        description: res.error || "Failed to delete community.",
        variant: "destructive",
      });
      return;
    }
    setCommunities((prev) => prev.filter((item) => item.id !== community.id));
    toast({ title: "Deleted", description: `"${community.name}" removed.` });
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Communities</h1>
        <p className="page-subtitle">Browse and manage community records.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Button onClick={() => setIsAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Community
            </Button>
          </div>

          <div className="rounded-lg border border-border/70 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30 border-b">
                  <div className="col-span-1">ID</div>
                  <div className="col-span-4">Name</div>
                  <div className="col-span-2">Created</div>
                  <div className="col-span-2">Updated</div>
                  <div className="col-span-3 text-right">Actions</div>
                </div>

                {isLoading ? (
                  <div className="divide-y">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-12 gap-4 px-4 py-3 items-center animate-pulse"
                      >
                        <div className="col-span-1 h-3 bg-muted rounded" />
                        <div className="col-span-4 h-4 bg-muted rounded" />
                        <div className="col-span-2 h-3 bg-muted rounded" />
                        <div className="col-span-2 h-3 bg-muted rounded" />
                        <div className="col-span-3 h-8 bg-muted rounded" />
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No communities found.
                  </div>
                ) : (
                  <div className="divide-y">
                    {filtered.map((community) => (
                      <div
                        key={community.id}
                        className="grid grid-cols-12 gap-4 px-4 py-3 items-center"
                      >
                        <div className="col-span-1 text-sm text-muted-foreground">
                          {community.id}
                        </div>
                        <div className="col-span-4">
                          {editingId === community.id ? (
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                              autoFocus
                              className="bg-background"
                            />
                          ) : (
                            <div className="text-sm font-medium text-foreground">
                              {community.name}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 text-sm text-muted-foreground">
                          {formatDate(community.created_datetime_utc, timeZone)}
                        </div>
                        <div className="col-span-2 text-sm text-muted-foreground">
                          {formatDate(community.modified_datetime_utc, timeZone)}
                        </div>
                        <div className="col-span-3 flex justify-end gap-2">
                          {editingId === community.id ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={saveEdit}
                                aria-label="Save community name"
                                className="text-primary hover:text-primary/80"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={cancelEdit}
                                aria-label="Cancel rename"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => startEdit(community)}
                                aria-label="Rename community"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteCommunity(community)}
                                aria-label="Delete community"
                                className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Community</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Community name"
            value={newCommunityName}
            onChange={(e) => setNewCommunityName(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCommunity}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
