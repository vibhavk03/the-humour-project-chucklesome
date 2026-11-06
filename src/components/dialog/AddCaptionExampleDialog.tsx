'use client';

import { useState } from 'react';
import { CaptionExamplesService } from '@/services/caption-examples.service';
import type { CaptionExampleInsert } from '@/types/caption-example';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { UploadImage } from '@/components/button/UploadImage';

export type CaptionCategoryOption = { id: number; name: string };

export default function AddCaptionExampleDialog({
  onAdded,
  categories = [],
}: {
  onAdded: () => void;
  categories?: CaptionCategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [form, setForm] = useState<CaptionExampleInsert>({
    image_description: '',
    caption: '',
    explanation: '',
    priority: 0,
    image_id: undefined,
    caption_example_category_id: null,
  });

  const resetState = () => {
    setForm({
      image_description: '',
      caption: '',
      explanation: '',
      priority: 0,
      image_id: undefined,
      caption_example_category_id: null,
    });
    setError('');
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (
      !form.image_description.trim() ||
      !form.caption.trim() ||
      !form.explanation.trim()
    ) {
      setError('All fields except priority and category are required.');
      return;
    }

    setLoading(true);
    try {
      await CaptionExamplesService.addCaptionExample(form);
      setOpen(false);
      resetState();
      onAdded();
    } catch (err: any) {
      setError(err?.message || 'Failed to add caption example.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          resetState();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
        >
          + Add Caption Example
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Caption Example</DialogTitle>
        </DialogHeader>
        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Image</Label>
            <UploadImage
              onImageUploaded={(imageId) =>
                setForm({ ...form, image_id: imageId })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-caption-image-description">
              Image Description
            </Label>
            <Textarea
              id="add-caption-image-description"
              placeholder="Describe the image..."
              className="min-h-[120px]"
              value={form.image_description}
              onChange={(e) =>
                setForm({ ...form, image_description: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-caption-caption">Caption</Label>
            <Textarea
              id="add-caption-caption"
              placeholder="Write the caption..."
              className="min-h-[80px]"
              value={form.caption}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-caption-explanation">Explanation</Label>
            <Textarea
              id="add-caption-explanation"
              placeholder="Explain why this caption works..."
              className="min-h-[120px]"
              value={form.explanation}
              onChange={(e) =>
                setForm({ ...form, explanation: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-caption-category">Category</Label>
            <select
              id="add-caption-category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={
                form.caption_example_category_id != null
                  ? String(form.caption_example_category_id)
                  : ''
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  caption_example_category_id:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-caption-priority">Priority</Label>
            <Input
              id="add-caption-priority"
              type="number"
              min={0}
              placeholder="0"
              value={String(form.priority ?? '')}
              onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form, priority: val === '' ? 0 : Number(val) });
              }}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Add Example'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
