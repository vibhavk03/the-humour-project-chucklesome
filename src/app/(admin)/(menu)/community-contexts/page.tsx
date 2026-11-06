"use client";
import { useState, useEffect, useMemo } from "react";
import Community from "@/types/community";
import { CommunitiesDropdown } from "@/components/filter/CommunitiesDropdown";
import { CommunitiesService } from "@/services/communities.service";
import { ContextTagsService } from "@/services/context-tags.service";
import Context from "@/types/context";
import CommunityContextTag from "@/types/community-context-tag";
import AddContextDialog from "@/components/dialog/AddContextDialog";
import EditContextDialog from "@/components/dialog/EditContextDialog";
import DeleteContextDialog from "@/components/dialog/DeleteContextDialog";
import AssignContextTagsDialog from "@/components/dialog/AssignContextTagsDialog";
import { MultiSelectContextTagsDropdown } from "@/components/filter/MultiSelectContextTagsDropdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";


const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;

  const escaped = escapeRegExp(query);
  const regex = new RegExp(`(${escaped})`, "ig");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        <span
          key={index}
          className="rounded-sm bg-secondary text-secondary-foreground"
        >
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

export default function CommunityContextsPage() {
  const [selectedCommunity, setSelectedCommunity] = useState<Community["id"] | null>(null);
  const [communityContexts, setCommunityContexts] = useState<Context[]>([]);
  const [contextTags, setContextTags] = useState<{ [key: number]: any[] }>({});
  const [allTags, setAllTags] = useState<CommunityContextTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;


  useEffect(() => {
    const fetchCommunityContexts = async () => {
      const response = selectedCommunity === null
        ? await CommunitiesService.getAllCommunityContexts()
        : await CommunitiesService.getCommunityContext(selectedCommunity);
      if (Array.isArray(response)) {
        setCommunityContexts(response);
        // Fetch tags for each context
        const tagsMap: { [key: number]: any[] } = {};
        for (const context of response) {
          const tags = await ContextTagsService.getTagsForContext(context.id);
          if (Array.isArray(tags)) {
            tagsMap[context.id] = tags;
          }
        }
        setContextTags(tagsMap);
      } else {
        console.error("Error fetching contexts", response?.error);
        setCommunityContexts([]);
      }
    };
    fetchCommunityContexts();
  }, [selectedCommunity]);

  useEffect(() => {
    const fetchAllTags = async () => {
      const tags = await ContextTagsService.getAllTags();
      if (Array.isArray(tags)) {
        setAllTags(tags as CommunityContextTag[]);
      } else {
        console.error("Error fetching context tags", (tags as any)?.error);
        setAllTags([]);
      }
    };

    fetchAllTags();
  }, []);

  useEffect(() => {
    const fetchCommunities = async () => {
      const response = await CommunitiesService.getAllCommunities();
      if (Array.isArray(response)) {
        setCommunities(response);
      } else {
        console.error("Error fetching communities", (response as any)?.error);
        setCommunities([]);
      }
    };

    fetchCommunities();
  }, []);

  const refreshContexts = async () => {
    const response = selectedCommunity === null
      ? await CommunitiesService.getAllCommunityContexts()
      : await CommunitiesService.getCommunityContext(selectedCommunity);
    if (Array.isArray(response)) {
      setCommunityContexts(response);
      // Refresh tags as well
      const tagsMap: { [key: number]: any[] } = {};
      for (const context of response) {
        const tags = await ContextTagsService.getTagsForContext(context.id);
        if (Array.isArray(tags)) {
          tagsMap[context.id] = tags;
        }
      }
      setContextTags(tagsMap);
    }
  };

  const communityNameById = useMemo(() => {
    return new Map(communities.map((community) => [community.id, community.name]));
  }, [communities]);

  const selectedCommunityName = selectedCommunity !== null
    ? communityNameById.get(selectedCommunity) ?? null
    : null;

  const pageTitle = selectedCommunityName
    ? `${selectedCommunityName} Community`
    : "Community Contexts";

  const selectedTags = allTags.filter((tag) =>
    selectedTagIds.includes(tag.id)
  );

  const handleTagRemove = (tagId: number) => {
    setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
  };

  const filteredContexts = useMemo(() => {
    return communityContexts.filter((context) => {
      // Text search filter
      const matchesSearch = (context.content ?? "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      // Tag-based filter (show if it has AT LEAST ONE selected tag)
      const tagsForContext = contextTags[context.id] || [];
      const tagIdsForContext = tagsForContext.map(
        (tag: CommunityContextTag) => tag.id
      );

      const matchesTag =
        selectedTagIds.length === 0 ||
        tagIdsForContext.some((id) => selectedTagIds.includes(id));

      return matchesSearch && matchesTag;
    });
  }, [communityContexts, contextTags, searchQuery, selectedTagIds]);

  const totalPages = Math.max(1, Math.ceil(filteredContexts.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart =
    filteredContexts.length === 0 ? 0 : (safePage - 1) * ITEMS_PER_PAGE + 1;
  const pageEnd = Math.min(filteredContexts.length, safePage * ITEMS_PER_PAGE);
  const paginatedContexts = filteredContexts.slice(pageStart - 1, pageEnd);
  const showPagination = filteredContexts.length > ITEMS_PER_PAGE;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTagIds, selectedCommunity]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="page-header">
          <h1 className="page-title">{pageTitle}</h1>
          <p className="page-subtitle">Manage contexts, tags, and community metadata.</p>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <CommunitiesDropdown
              communities={communities}
              selectedCommunityId={selectedCommunity}
              onSelectCommunity={setSelectedCommunity}
            />
            <Input
              placeholder="Search contexts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-[220px]"
            />
            <MultiSelectContextTagsDropdown
              allTags={allTags}
              selectedTagIds={selectedTagIds}
              setSelectedTagIds={setSelectedTagIds}
            />
          </div>
          <AddContextDialog
            selectedCommunity={selectedCommunity}
            onContextAdded={refreshContexts}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleTagRemove(tag.id)}
              className="flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs"
            >
              <span>{tag.name}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      </div>

      {/* Context list */}
      <div className="grid gap-4">
        {filteredContexts.length === 0 ? (
          <p className="text-muted-foreground text-center italic py-6">
            No contexts yet. Add one above!
          </p>
        ) : (
          paginatedContexts.map((context) => {
            const fullText = (context.content || "").trim();
            const previewText =
              fullText.length > 277 ? fullText.slice(0, 277) + "..." : fullText;
            return (
              <div
                key={context.id}
                className="border border-border rounded-md shadow-sm bg-card overflow-hidden"
              >
                <div className="flex items-start justify-between px-4 py-3 gap-4">
                  {/* Left side: ID, Title, Description, Tags */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex flex-col items-start gap-1 flex-shrink-0">
                        <span className="font-sans text-sm text-muted-foreground">
                          {context.id}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {context.community_id
                            ? communityNameById.get(context.community_id) ??
                              `Community ${context.community_id}`
                            : "Unassigned"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground mb-2">
                          {highlightText(previewText, searchQuery)}
                        </p>
                        {/* Display assigned tags */}
                        {contextTags[context.id] && contextTags[context.id].length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {contextTags[context.id].map((tag, index) => (
                              <span
                                key={`${context.id}-${tag.id}-${index}`}
                                className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <AssignContextTagsDialog
                      context={context}
                      onTagsUpdated={refreshContexts}
                    />
                    <EditContextDialog
                      context={context}
                      onContextUpdated={refreshContexts}
                    />
                    <DeleteContextDialog
                      context={context}
                      onContextDeleted={refreshContexts}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {showPagination && (
        <div className="mt-6 flex flex-col items-center justify-between gap-2 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing {pageStart}-{pageEnd} of {filteredContexts.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={safePage === 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
            >
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage === totalPages}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
