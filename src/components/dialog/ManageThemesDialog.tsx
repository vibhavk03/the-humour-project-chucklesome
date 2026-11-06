"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import HumorThemesManager from "@/components/HumorThemesManager";

export default function ManageThemesDialog({ onThemesUpdated }: { onThemesUpdated?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" onClick={() => setIsOpen(true)}>
          <Sparkles className="h-4 w-4" />
          <span className="ml-2">Humor Themes</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Humor Themes</DialogTitle>
          <DialogDescription>
            Create and manage themes that can be assigned to humor flavors.
          </DialogDescription>
        </DialogHeader>

        <HumorThemesManager
          active={isOpen}
          onThemesUpdated={onThemesUpdated}
          className="py-4"
        />
      </DialogContent>
    </Dialog>
  );
}
