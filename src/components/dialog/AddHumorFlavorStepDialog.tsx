'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CirclePlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { LlmService } from '@/services/llm.service'
import LlmModel from '@/types/llm-model'
import LlmInputType from '@/types/llm-input-type'
import LlmOutputType from '@/types/llm-output-type'
import { HumorFlavorStepsService } from '@/services/humor-flavor-steps.service'
import HumorFlavorStepType from '@/types/humor-flavor-step-type'
import { HumorFlavorStepTypesService } from '@/services/humor-flavor-step-types.service'

export default function AddHumorFlavorStepDialog({
  humorFlavorId,
  onStepAdded,
  defaultNextOrder,
}: {
  humorFlavorId: number
  onStepAdded: () => void
  defaultNextOrder: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [models, setModels] = useState<LlmModel[]>([])
  const [inputTypes, setInputTypes] = useState<LlmInputType[]>([])
  const [outputTypes, setOutputTypes] = useState<LlmOutputType[]>([])
  const [stepTypes, setStepTypes] = useState<HumorFlavorStepType[]>([])

  const [modelId, setModelId] = useState<number | undefined>(undefined)
  const [stepTypeId, setStepTypeId] = useState<number | null>(null)
  const [inputTypeId, setInputTypeId] = useState<number | undefined>(undefined)
  const [outputTypeId, setOutputTypeId] = useState<number | undefined>(
    undefined
  )
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [userPrompt, setUserPrompt] = useState<string>('')
  const [temperature, setTemperature] = useState<number | null>(1)
  const [orderBy, setOrderBy] = useState<number>(defaultNextOrder)

  const [errors, setErrors] = useState<{
    modelId?: string
    stepTypeId?: string
    inputTypeId?: string
    outputTypeId?: string
    systemPrompt?: string
    userPrompt?: string
    temperature?: string
    orderBy?: string
  }>({})

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

  useEffect(() => setOrderBy(defaultNextOrder), [defaultNextOrder])

  const selectedModel = useMemo(
    () => models.find((m) => m.id === modelId),
    [models, modelId]
  )
  const isTemperatureSupported = !!selectedModel?.is_temperature_supported

  const handleSave = async () => {
    const newErrors: typeof errors = {}
    if (!modelId) newErrors.modelId = 'Model is required'
    if (!stepTypeId) newErrors.stepTypeId = 'Step type is required'
    if (!inputTypeId) newErrors.inputTypeId = 'Input type is required'
    if (!outputTypeId) newErrors.outputTypeId = 'Output type is required'
    if (!systemPrompt.trim())
      newErrors.systemPrompt = 'System prompt is required'
    if (!userPrompt.trim()) newErrors.userPrompt = 'User prompt is required'
    if (isTemperatureSupported) {
      if (temperature === undefined || temperature === null)
        newErrors.temperature = 'Temperature is required'
      else if (
        Number.isNaN(temperature) ||
        (temperature as number) < 0 ||
        (temperature as number) > 2
      )
        newErrors.temperature = 'Temperature must be between 0–2'
    }
    if (orderBy === undefined || orderBy === null)
      newErrors.orderBy = 'Step is required'
    else if (!Number.isInteger(orderBy))
      newErrors.orderBy = 'Step must be a whole number'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      const missing = Object.values(newErrors).join('; ')
      toast({
        title: 'Missing or invalid fields',
        description: missing,
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    const payload = {
      humor_flavor_id: humorFlavorId,
      humor_flavor_step_type_id: stepTypeId ?? null,
      llm_model_id: modelId,
      llm_input_type_id: inputTypeId,
      llm_output_type_id: outputTypeId,
      llm_system_prompt: systemPrompt.trim(),
      llm_user_prompt: userPrompt.trim(),
      llm_temperature: isTemperatureSupported ? temperature : null,
      order_by: orderBy,
    }

    const result = await HumorFlavorStepsService.createStep(payload as any)
    setIsSaving(false)

    if ((result as any)?.error) {
      const err = (result as any).error
      toast({
        title: 'Could not create step',
        description: err?.message || 'Please try again in a moment.',
        variant: 'destructive',
      })
      return
    }

    toast({
      title: 'Step added',
      description: 'Your new step has been created.',
    })
    setIsOpen(false)
    onStepAdded()
  }

  const selectClasses = (hasError?: boolean) =>
    `p-2 rounded border border-input bg-background text-foreground w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${hasError ? 'border-destructive focus-visible:ring-destructive' : ''}`

  const inputClasses = (hasError?: boolean) =>
    `w-full ${hasError ? 'border-destructive focus-visible:ring-destructive' : ''}`

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button onClick={() => setIsOpen(true)}>
          <CirclePlus />
          <span className="ml-2">Add Humor Flavor Step</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Humor Flavor Step</DialogTitle>
          <DialogDescription>
            Define the model, IO types, system/user prompts, step type,
            temperature, and order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">
              Model <span className="text-destructive">*</span>
            </label>
            <select
              className={selectClasses(!!errors.modelId)}
              value={modelId ?? ''}
              onChange={(e) => {
                setModelId(Number(e.target.value) || undefined)
                setErrors((prev) => ({ ...prev, modelId: undefined }))
              }}
            >
              <option value="">Select model</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {errors.modelId && (
              <p className="text-xs text-destructive mt-1">{errors.modelId}</p>
            )}
          </div>
          <div>
            <label className="text-sm">
              Input Type <span className="text-destructive">*</span>
            </label>
            <select
              className={selectClasses(!!errors.inputTypeId)}
              value={inputTypeId ?? ''}
              onChange={(e) => {
                setInputTypeId(Number(e.target.value) || undefined)
                setErrors((prev) => ({ ...prev, inputTypeId: undefined }))
              }}
            >
              <option value="">Select input type</option>
              {inputTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.slug}
                </option>
              ))}
            </select>
            {errors.inputTypeId && (
              <p className="text-xs text-destructive mt-1">
                {errors.inputTypeId}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm">
              Output Type <span className="text-destructive">*</span>
            </label>
            <select
              className={selectClasses(!!errors.outputTypeId)}
              value={outputTypeId ?? ''}
              onChange={(e) => {
                setOutputTypeId(Number(e.target.value) || undefined)
                setErrors((prev) => ({ ...prev, outputTypeId: undefined }))
              }}
            >
              <option value="">Select output type</option>
              {outputTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.slug}
                </option>
              ))}
            </select>
            {errors.outputTypeId && (
              <p className="text-xs text-destructive mt-1">
                {errors.outputTypeId}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm">
              System Prompt <span className="text-destructive">*</span>
            </label>
            <Textarea
              className={inputClasses(!!errors.systemPrompt)}
              rows={4}
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value)
                setErrors((prev) => ({ ...prev, systemPrompt: undefined }))
              }}
              placeholder="Enter the system prompt for this step."
            />
            {errors.systemPrompt && (
              <p className="text-xs text-destructive mt-1">
                {errors.systemPrompt}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm">
              User Prompt <span className="text-destructive">*</span>
            </label>
            <Textarea
              className={inputClasses(!!errors.userPrompt)}
              rows={4}
              value={userPrompt}
              onChange={(e) => {
                setUserPrompt(e.target.value)
                setErrors((prev) => ({ ...prev, userPrompt: undefined }))
              }}
              placeholder="Enter the user prompt for this step."
            />
            {errors.userPrompt && (
              <p className="text-xs text-destructive mt-1">
                {errors.userPrompt}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm">
              Step Type <span className="text-destructive">*</span>
            </label>
            <select
              className={selectClasses(!!errors.stepTypeId)}
              value={stepTypeId ?? ''}
              onChange={(e) => {
                setStepTypeId(e.target.value ? Number(e.target.value) : null)
                setErrors((prev) => ({ ...prev, stepTypeId: undefined }))
              }}
            >
              <option value="">Select step type</option>
              {stepTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.slug}
                </option>
              ))}
            </select>
            {errors.stepTypeId && (
              <p className="text-xs text-destructive mt-1">
                {errors.stepTypeId}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm">
              Temperature{' '}
              {isTemperatureSupported && (
                <span className="text-destructive">*</span>
              )}
            </label>
            <Input
              className={inputClasses(!!errors.temperature)}
              type="number"
              value={temperature ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setTemperature(v === '' ? null : Number(v))
                setErrors((prev) => ({ ...prev, temperature: undefined }))
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
            {errors.temperature && (
              <p className="text-xs text-destructive mt-1">
                {errors.temperature}
              </p>
            )}
            {isTemperatureSupported && (
              <p className="text-xs text-muted-foreground mt-1">
                Must be between 0–2. Higher = more randomness.
              </p>
            )}
          </div>
          <div>
            <label className="text-sm">
              Step <span className="text-destructive">*</span>
            </label>
            <Input
              className={inputClasses(!!errors.orderBy)}
              type="number"
              value={orderBy}
              onChange={(e) => {
                setOrderBy(Number(e.target.value))
                setErrors((prev) => ({ ...prev, orderBy: undefined }))
              }}
              step={1}
            />
            {errors.orderBy && (
              <p className="text-xs text-destructive mt-1">{errors.orderBy}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Whole numbers only.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
