'use client';

import { useState, useEffect } from 'react';
import CaptionExample from '@/types/caption-example';
import { CaptionExamplesService } from '@/services/caption-examples.service';
import { ImageService } from '@/services/images.service';
import { UploadImage } from '@/components/button/UploadImage';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
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
import type { CaptionCategoryOption } from '@/components/dialog/AddCaptionExampleDialog';

export default function EditCaptionExampleDialog({
  example,
  onUpdated,
  categories = [],
}: {
  example: CaptionExample;
  onUpdated: () => void;
  categories?: CaptionCategoryOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Caption Example</DialogTitle>
        </DialogHeader>
        {open && (
          <EditCaptionExampleForm
            example={example}
            categories={categories}
            onClose={() => setOpen(false)}
            onUpdated={onUpdated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditCaptionExampleForm({
  example,
  categories,
  onClose,
  onUpdated,
}: {
  example: CaptionExample;
  categories: CaptionCategoryOption[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState<CaptionExample>(example);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [changeImage, setChangeImage] = useState(false);

  useEffect(() => {
    if (example.image_id) {
      const fetchImage = async () => {
        try {
          const img = await ImageService.getImageById(example.image_id!);
          if (img?.url) {
            setExistingImageUrl(img.url);
          }
        } catch (err) {
          console.error('Failed to fetch existing image details:', err);
        }
      };
      fetchImage();
    }
  }, [example.image_id]);

  const handleSubmit = async () => {
    if (
      !form.image_description.trim() ||
      !form.caption.trim() ||
      !form.explanation.trim()
    ) {
      setError('All fields except priority are required.');
      return;
    }
    setLoading(true);
    try {
      await CaptionExamplesService.updateCaptionExample(example.id, {
        image_description: form.image_description,
        caption: form.caption,
        explanation: form.explanation,
        priority: form.priority,
        image_id: form.image_id,
        caption_example_category_id: form.caption_example_category_id ?? null,
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update caption example.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Image</Label>
          {form.image_id && existingImageUrl && !changeImage ? (
            <div className="flex flex-col items-center gap-3 p-4 border border-border rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
              <Image
                src={existingImageUrl}
                alt="Current Caption Image"
                width={200}
                height={200}
                className="max-h-48 object-contain rounded-lg shadow-sm"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setChangeImage(true)}
              >
                Change Image
              </Button>
            </div>
          ) : (
            <UploadImage
              onImageUploaded={(imageId) => {
                setForm({ ...form, image_id: imageId });
                setChangeImage(false);
              }}
            />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`edit-caption-image-description-${example.id}`}>
            Image Description
          </Label>
          <Textarea
            id={`edit-caption-image-description-${example.id}`}
            className="min-h-[120px]"
            value={form.image_description}
            onChange={(e) =>
              setForm({ ...form, image_description: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`edit-caption-caption-${example.id}`}>Caption</Label>
          <Textarea
            id={`edit-caption-caption-${example.id}`}
            className="min-h-[80px]"
            value={form.caption}
            onChange={(e) => setForm({ ...form, caption: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`edit-caption-explanation-${example.id}`}>
            Explanation
          </Label>
          <Textarea
            id={`edit-caption-explanation-${example.id}`}
            className="min-h-[120px]"
            value={form.explanation}
            onChange={(e) => setForm({ ...form, explanation: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`edit-caption-category-${example.id}`}>Category</Label>
          <select
            id={`edit-caption-category-${example.id}`}
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
          <Label htmlFor={`edit-caption-priority-${example.id}`}>Priority</Label>
          <Input
            id={`edit-caption-priority-${example.id}`}
            type="number"
            min={0}
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
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Updating...' : 'Save Changes'}
        </Button>
      </DialogFooter>
    </div>
  );
}
