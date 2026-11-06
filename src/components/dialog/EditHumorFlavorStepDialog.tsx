'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { LlmService } from '@/services/llm.service'
import LlmModel from '@/types/llm-model'
import LlmInputType from '@/types/llm-input-type'
import LlmOutputType from '@/types/llm-output-type'
import { HumorFlavorStepsService } from '@/services/humor-flavor-steps.service'
import HumorFlavorStep from '@/types/humor-flavor-step'
import HumorFlavorStepType from '@/types/humor-flavor-step-type'
import { HumorFlavorStepTypesService } from '@/services/humor-flavor-step-types.service'

export default function EditHumorFlavorStepDialog({
  step,
  onStepUpdated,
}: {
  step: HumorFlavorStep
  onStepUpdated: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [models, setModels] = useState<LlmModel[]>([])
  const [inputTypes, setInputTypes] = useState<LlmInputType[]>([])
  const [outputTypes, setOutputTypes] = useState<LlmOutputType[]>([])
  const [stepTypes, setStepTypes] = useState<HumorFlavorStepType[]>([])

  const [modelId, setModelId] = useState<number>(step.llm_model_id)
  const [inputTypeId, setInputTypeId] = useState<number>(step.llm_input_type_id)
  const [outputTypeId, setOutputTypeId] = useState<number>(
    step.llm_output_type_id
  )
  const [systemPrompt, setSystemPrompt] = useState<string>(
    step.llm_system_prompt ?? ''
  )
  const [userPrompt, setUserPrompt] = useState<string>(
    step.llm_user_prompt ?? ''
  )
  const [temperature, setTemperature] = useState<number | null>(
    step.llm_temperature
  )
  const selectedModel = useMemo(
    () => models.find((m) => m.id === modelId),
    [models, modelId]
  )
  const isTemperatureSupported = !!selectedModel?.is_temperature_supported
  const [orderBy, setOrderBy] = useState<number>(step.order_by)
  const [stepTypeId, setStepTypeId] = useState<number | null>(
    step.humor_flavor_step_type_id ?? null
  )

  const { toast } = useToast()

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [modelsData, inputData, outputData, allStepTypes] =
          await Promise.all([
            LlmService.getAllModels(),
            LlmService.getAllInputTypes(),
            LlmService.getAllOutputTypes(),
            HumorFlavorStepTypesService.getAll(),
          ])
        setModels(modelsData)
        setInputTypes(inputData)
        setOutputTypes(outputData)
        setStepTypes(allStepTypes)
      } catch (e: any) {
        toast({
          title: 'Failed to load options',
          description: e?.message || 'Please close and reopen the dialog.',
          variant: 'destructive',
        })
      }
    }
    if (isOpen) loadLookups()
  }, [isOpen, toast])

  const handleSave = async () => {
    if (
      !modelId ||
      !inputTypeId ||
      !outputTypeId ||
      !systemPrompt.trim() ||
      !userPrompt.trim() ||
      stepTypeId === null ||
      stepTypeId === undefined ||
      orderBy === undefined
    ) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      })
      return
    }

    if (!Number.isInteger(orderBy)) {
      toast({
        title: 'Invalid step',
        description: 'Step must be a whole number (integer).',
        variant: 'destructive',
      })
      return
    }

    if (isTemperatureSupported) {
      if (
        temperature === null ||
        Number.isNaN(temperature) ||
        (temperature as number) < 0 ||
        (temperature as number) > 2
      ) {
        toast({
          title: 'Invalid temperature',
          description: 'Temperature must be between 0-2.',
          variant: 'destructive',
        })
        return
      }
    }

    setIsSaving(true)
    const updates = {
      llm_model_id: modelId,
      llm_input_type_id: inputTypeId,
      llm_output_type_id: outputTypeId,
      llm_system_prompt: systemPrompt.trim(),
      llm_user_prompt: userPrompt.trim(),
      humor_flavor_step_type_id: stepTypeId,
      llm_temperature: isTemperatureSupported ? temperature : null,
      order_by: orderBy,
    } as Partial<HumorFlavorStep>

    const result = await HumorFlavorStepsService.updateStep(
      step.id,
      updates as any
    )
    setIsSaving(false)

    if ((result as any)?.error) {
      const err = (result as any).error
      toast({
        title: 'Could not update step',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      })
      return
    }

    toast({
      title: 'Step updated',
      description: 'Your changes have been saved.',
    })
    setIsOpen(false)
    onStepUpdated()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0">
        <div className="flex flex-col max-h-[80vh]">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>Edit Humor Flavor Step</DialogTitle>
            <DialogDescription>
              Update model, input/output types, system/user prompts, step type,
              temperature, and order_by.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Model</label>
                <select
                  className="mt-1 p-3 rounded border border-input bg-background text-foreground w-full"
                  value={modelId}
                  onChange={(e) => setModelId(Number(e.target.value))}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm">Input Type</label>
                <select
                  className="mt-1 p-3 rounded border border-input bg-background text-foreground w-full"
                  value={inputTypeId}
                  onChange={(e) => setInputTypeId(Number(e.target.value))}
                >
                  {inputTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.slug}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm">Output Type</label>
                <select
                  className="mt-1 p-3 rounded border border-input bg-background text-foreground w-full"
                  value={outputTypeId}
                  onChange={(e) => setOutputTypeId(Number(e.target.value))}
                >
                  {outputTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.slug}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-sm">System Prompt</label>
                <Textarea
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Enter the system prompt for this step."
                />
              </div>

              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-sm">User Prompt</label>
                <Textarea
                  rows={4}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Enter the user prompt for this step."
                />
              </div>

              <div>
                <label className="text-sm">
                  Step Type <span className="text-destructive">*</span>
                </label>
                <select
                  className="mt-1 p-3 rounded border border-input bg-background text-foreground w-full"
                  value={stepTypeId ?? ''}
                  onChange={(e) => setStepTypeId(Number(e.target.value))}
                >
                  {stepTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.slug}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm">Temperature</label>
                <Input
                  type="number"
                  value={temperature ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setTemperature(v === '' ? null : Number(v))
                  }}
                  step={0.1}
                  min={0}
                  max={2}
                  disabled={!isTemperatureSupported}
                />
                {!isTemperatureSupported && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Temperature disabled for this model.
                  </p>
                )}
                {isTemperatureSupported && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Must be between 0–2. Higher = more randomness.
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm">Step</label>
                <Input
                  type="number"
                  value={orderBy}
                  onChange={(e) => setOrderBy(Number(e.target.value))}
                  step={1}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Whole numbers only.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 pt-4 border-t flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
