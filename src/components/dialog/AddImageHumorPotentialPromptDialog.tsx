"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageHumorPotentialPromptsService } from "@/services/image-humor-potential-prompts.service";
import { LlmService } from "@/services/llm.service";
import LlmModel from "@/types/llm-model";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_TEMPERATURE = "0.3";

interface AddImageHumorPotentialPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function AddImageHumorPotentialPromptDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddImageHumorPotentialPromptDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [llmModelId, setLlmModelId] = useState("");
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;

    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const data = await LlmService.getAllModels();
        setModels(data);
      } catch (error) {
        console.error("Failed to load LLM models:", error);
        toast({
          title: "Error",
          description: "Failed to load LLM models",
          variant: "destructive",
        });
      } finally {
        setIsLoadingModels(false);
      }
    };

    void loadModels();
  }, [open, toast]);

  const handleClose = () => {
    setName("");
    setDescription("");
    setSystemPrompt("");
    setUserPrompt("");
    setLlmModelId("");
    setTemperature(DEFAULT_TEMPERATURE);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !systemPrompt.trim() || !userPrompt.trim() || !llmModelId) {
      toast({
        title: "Missing required fields",
        description: "Name, system prompt, user prompt, and model are all required.",
        variant: "destructive",
      });
      return;
    }

    const parsedTemperature = Number.parseFloat(temperature);
    if (!Number.isFinite(parsedTemperature) || parsedTemperature < 0 || parsedTemperature > 2) {
      toast({
        title: "Invalid temperature",
        description: "Temperature must be a number between 0 and 2.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await ImageHumorPotentialPromptsService.create({
        name: name.trim(),
        description: description.trim() || null,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        llm_model_id: Number(llmModelId),
        llm_temperature: parsedTemperature,
      });
      toast({ title: "Success", description: "Prompt created successfully" });
      onSuccess();
      handleClose();
    } catch (error) {
      console.error("Failed to create prompt:", error);
      toast({
        title: "Error",
        description: "Failed to create prompt. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>New Prompt</DialogTitle>
          <DialogDescription>
            Create a named prompt the scoring pipeline can load by id.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 overflow-y-auto py-4 pr-1">
          <div className="space-y-2">
            <Label htmlFor="prompt-name">Name</Label>
            <Input id="prompt-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-description">Description</Label>
            <Textarea
              id="prompt-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-system">System prompt</Label>
            <Textarea
              id="prompt-system"
              rows={10}
              className="font-mono text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-user">User prompt</Label>
            <Textarea
              id="prompt-user"
              rows={10}
              className="font-mono text-xs"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-model">Model</Label>
              <Select
                value={llmModelId}
                onValueChange={setLlmModelId}
                disabled={isLoadingModels || models.length === 0}
              >
                <SelectTrigger id="prompt-model">
                  <SelectValue
                    placeholder={isLoadingModels ? "Loading models..." : "Select model"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id.toString()}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-temperature">Temperature</Label>
              <Input
                id="prompt-temperature"
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
