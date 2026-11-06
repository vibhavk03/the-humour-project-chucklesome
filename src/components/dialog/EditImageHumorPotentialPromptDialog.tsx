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
import ImageHumorPotentialPrompt from "@/types/image-humor-potential-prompt";
import { useToast } from "@/hooks/use-toast";

interface EditImageHumorPotentialPromptDialogProps {
  prompt: ImageHumorPotentialPrompt | null;
  onOpenChange: () => void;
  onSuccess: () => void;
}

export default function EditImageHumorPotentialPromptDialog({
  prompt,
  onOpenChange,
  onSuccess,
}: EditImageHumorPotentialPromptDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [llmModelId, setLlmModelId] = useState("");
  const [temperature, setTemperature] = useState("0.3");
  const [models, setModels] = useState<LlmModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!prompt) return;

    setName(prompt.name);
    setDescription(prompt.description || "");
    setSystemPrompt(prompt.system_prompt);
    setUserPrompt(prompt.user_prompt);
    setLlmModelId(prompt.llm_model_id.toString());
    setTemperature(prompt.llm_temperature.toString());

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
  }, [prompt, toast]);

  const handleSubmit = async () => {
    if (!prompt) return;
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
      await ImageHumorPotentialPromptsService.update(prompt.id, {
        name: name.trim(),
        description: description.trim() || null,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        llm_model_id: Number(llmModelId),
        llm_temperature: parsedTemperature,
      });
      toast({ title: "Success", description: "Prompt updated successfully" });
      onSuccess();
      onOpenChange();
    } catch (error) {
      console.error("Failed to update prompt:", error);
      toast({
        title: "Error",
        description: "Failed to update prompt. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!prompt} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Edit Prompt</DialogTitle>
          <DialogDescription>Update the details for this prompt.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 overflow-y-auto py-4 pr-1">
          <div className="space-y-2">
            <Label htmlFor="prompt-name-edit">Name</Label>
            <Input
              id="prompt-name-edit"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-description-edit">Description</Label>
            <Textarea
              id="prompt-description-edit"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-system-edit">System prompt</Label>
            <Textarea
              id="prompt-system-edit"
              rows={10}
              className="font-mono text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-user-edit">User prompt</Label>
            <Textarea
              id="prompt-user-edit"
              rows={10}
              className="font-mono text-xs"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-model-edit">Model</Label>
              <Select
                value={llmModelId}
                onValueChange={setLlmModelId}
                disabled={isLoadingModels || models.length === 0}
              >
                <SelectTrigger id="prompt-model-edit">
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
              <Label htmlFor="prompt-temperature-edit">Temperature</Label>
              <Input
                id="prompt-temperature-edit"
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
          <Button variant="outline" onClick={onOpenChange}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
