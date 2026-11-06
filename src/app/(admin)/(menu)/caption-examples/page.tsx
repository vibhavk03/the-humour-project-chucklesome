'use client';

import { useEffect, useState } from 'react';
import {
  CaptionExamplesService,
  type CaptionCategory,
} from '@/services/caption-examples.service';
import type { CaptionExampleWithCategory } from '@/types/caption-example';
import AddCaptionExampleDialog from '@/components/dialog/AddCaptionExampleDialog';
import EditCaptionExampleDialog from '@/components/dialog/EditCaptionExampleDialog';
import DeleteCaptionExampleDialog from '@/components/dialog/DeleteCaptionExampleDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL_CATEGORIES = 'all';

export default function CaptionExamplesPage() {
  const [examples, setExamples] = useState<CaptionExampleWithCategory[]>([]);
  const [categories, setCategories] = useState<CaptionCategory[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchExamples = async () => {
    const data = await CaptionExamplesService.getAllCaptionExamples();
    setExamples(data);
  };

  const fetchCategories = async () => {
    const data = await CaptionExamplesService.getCategories();
    setCategories(data);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load; refresh handlers reuse these
    fetchExamples();
    fetchCategories();
  }, []);

  const filtered = examples.filter((ex) => {
    const matchesSearch =
      ex.caption.toLowerCase().includes(search.toLowerCase()) ||
      ex.image_description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === ALL_CATEGORIES ||
      (ex.caption_example_category_id != null &&
        String(ex.caption_example_category_id) === categoryFilter);
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="page-header">
          <h1 className="page-title">Caption Examples</h1>
          <p className="page-subtitle">Curated examples used for prompts and quality checks.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search captions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[240px]"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="min-w-[180px]" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AddCaptionExampleDialog
            onAdded={fetchExamples}
            categories={categories}
          />
        </div>
      </div>

      {/* Expandable list as cards */}
      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <p className="text-center italic text-muted-foreground py-6">No caption examples found.</p>
        ) : (
          filtered.map((ex) => (
            <div
              key={ex.id}
              className="overflow-hidden rounded-lg border border-border/70 bg-card/85 shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/60 transition">
                <div
                  className="flex gap-3 items-center w-full"
                  onClick={() =>
                    setExpandedId(expandedId === ex.id ? null : ex.id)
                  }
                >
                  <span className="font-sans text-sm text-muted-foreground">{ex.id}</span>
                  <span className="font-medium text-foreground line-clamp-1">
                    {ex.caption}
                  </span>
                  {ex.caption_example_categories?.name && (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {ex.caption_example_categories.name}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExpandedId(expandedId === ex.id ? null : ex.id)
                  }
                  className="shrink-0"
                >
                  {expandedId === ex.id ? 'Collapse' : 'Expand'}
                </Button>

              </div>

              {/* Expanded content */}
              {expandedId === ex.id && (
                <div className="px-6 py-4 text-sm space-y-4 text-foreground">
                  <div>
                    <span className="font-semibold block mb-1">Image Description:</span>
                    <p className="whitespace-pre-wrap">{ex.image_description}</p>
                  </div>
                  <div>
                    <span className="font-semibold block mb-1">Explanation:</span>
                    <p className="whitespace-pre-wrap">{ex.explanation}</p>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <EditCaptionExampleDialog
                      example={ex}
                      onUpdated={fetchExamples}
                      categories={categories}
                    />
                    <DeleteCaptionExampleDialog id={ex.id} onDeleted={fetchExamples} />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
