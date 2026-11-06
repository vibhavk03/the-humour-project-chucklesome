'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { LlmService } from '@/services/llm.service'
import { HumorFlavorStepsService } from '@/services/humor-flavor-steps.service'
import { HumorFlavorStepTypesService } from '@/services/humor-flavor-step-types.service'
import HumorFlavorStep from '@/types/humor-flavor-step'
import LlmModel from '@/types/llm-model'
import LlmInputType from '@/types/llm-input-type'
import LlmOutputType from '@/types/llm-output-type'
import HumorFlavorStepType from '@/types/humor-flavor-step-type'

export default function EditHumorFlavorStepPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const pathname = usePathname()
  const { toast } = useToast()

  const stepId = useMemo(() => {
    const raw = params?.stepId
    const value = Array.isArray(raw) ? raw[0] : raw
    const parsed = value ? Number(value) : NaN
    if (Number.isFinite(parsed)) return parsed
    if (!pathname) return null
    const match = pathname.match(/\/steps\/([^/]+)\/edit/)
    if (!match) return null
    const parsedFromPath = Number(match[1])
    return Number.isFinite(parsedFromPath) ? parsedFromPath : null
  }, [params, pathname])

  const flavorIdFromPath = useMemo(() => {
    const raw = params?.humorFlavorId
    const value = Array.isArray(raw) ? raw[0] : raw
    const parsed = value ? Number(value) : NaN
    if (Number.isFinite(parsed)) return parsed
    if (!pathname) return null
    const match = pathname.match(/\/humor-flavor\/([^/]+)\/steps/)
    if (!match) return null
    const parsedFromPath = Number(match[1])
    return Number.isFinite(parsedFromPath) ? parsedFromPath : null
  }, [params, pathname])

  const fallbackFlavorId = useMemo(() => {
    const raw = searchParams.get('flavorId')
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : null
  }, [searchParams])

  const [step, setStep] = useState<HumorFlavorStep | null>(null)
  const [loadingStep, setLoadingStep] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingLookups, setIsLoadingLookups] = useState(true)

  const [models, setModels] = useState<LlmModel[]>([])
  const [inputTypes, setInputTypes] = useState<LlmInputType[]>([])
  const [outputTypes, setOutputTypes] = useState<LlmOutputType[]>([])
  const [stepTypes, setStepTypes] = useState<HumorFlavorStepType[]>([])

  const [modelId, setModelId] = useState<number | undefined>(undefined)
  const [inputTypeId, setInputTypeId] = useState<number | undefined>(undefined)
  const [outputTypeId, setOutputTypeId] = useState<number | undefined>(
    undefined
  )
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [userPrompt, setUserPrompt] = useState<string>('')
  const [temperature, setTemperature] = useState<number | null>(null)
  const [orderBy, setOrderBy] = useState<number>(1)
  const [stepTypeId, setStepTypeId] = useState<number | null>(null)
  const initializedStepIdRef = useRef<number | null>(null)

  const backHref = useMemo(() => {
    const flavorId =
      step?.humor_flavor_id ?? flavorIdFromPath ?? fallbackFlavorId
    if (flavorId) return `/humor-flavor/${flavorId}/steps`
    return '/humor-flavors'
  }, [step, flavorIdFromPath, fallbackFlavorId])

  useEffect(() => {
    if (!stepId) {
      setLoadError('Invalid step ID.')
      setLoadingStep(false)
      return
    }
    let active = true
    const loadStep = async () => {
      setLoadingStep(true)
      try {
        const data = await HumorFlavorStepsService.getStepById(stepId)
        if (!active) return
        if (!data) {
          setLoadError('Step not found.')
          setStep(null)
          return
        }
        setStep(data)
        setLoadError(null)
      } catch (e: any) {
        if (!active) return
        setLoadError(e?.message || 'Unable to load step.')
      } finally {
        if (active) setLoadingStep(false)
      }
    }
    loadStep()
    return () => {
      active = false
    }
  }, [stepId])

  useEffect(() => {
    initializedStepIdRef.current = null
  }, [stepId])

  useEffect(() => {
    if (!step) return
    if (initializedStepIdRef.current === step.id) return
    initializedStepIdRef.current = step.id
    setModelId(step.llm_model_id)
    setInputTypeId(step.llm_input_type_id)
    setOutputTypeId(step.llm_output_type_id)
    setSystemPrompt(step.llm_system_prompt ?? '')
    setUserPrompt(step.llm_user_prompt ?? '')
    setTemperature(step.llm_temperature)
    setOrderBy(step.order_by)
    setStepTypeId(step.humor_flavor_step_type_id ?? null)
  }, [step])

  useEffect(() => {
    let active = true
    const loadLookups = async () => {
      try {
        const [modelsData, inputData, outputData, allStepTypes] =
          await Promise.all([
            LlmService.getAllModels(),
            LlmService.getAllInputTypes(),
            LlmService.getAllOutputTypes(),
            HumorFlavorStepTypesService.getAll(),
          ])
        if (!active) return
        setModels(modelsData)
        setInputTypes(inputData)
        setOutputTypes(outputData)
        setStepTypes(allStepTypes)
      } catch (e: any) {
        toast({
          title: 'Failed to load options',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        if (active) setIsLoadingLookups(false)
      }
    }
    loadLookups()
    return () => {
      active = false
    }
  }, [toast])

  const selectedModel = useMemo(
    () => models.find((m) => m.id === modelId),
    [models, modelId]
  )
  const isTemperatureSupported = !!selectedModel?.is_temperature_supported

  const selectClasses = (hasError?: boolean) =>
    `p-2 rounded border border-input bg-background text-foreground w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${hasError ? 'border-destructive focus-visible:ring-destructive' : ''}`

  const inputClasses = (hasError?: boolean) =>
    `w-full ${hasError ? 'border-destructive focus-visible:ring-destructive' : ''}`

  const handleSave = async () => {
    if (!step) {
      toast({
        title: 'Unable to save',
        description: 'Step details are not loaded yet.',
        variant: 'destructive',
      })
      return
    }
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
    router.push(backHref)
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(backHref)}
        >
          &larr; Back to Flavor Steps
        </Button>
        <h1 className="page-title mt-2">Edit Humor Flavor Step</h1>
        <p className="page-subtitle">
          Update model, input/output types, system/user prompts, step type,
          temperature, and order.
        </p>
      </div>
      <Separator />

      {loadingStep ? (
        <div className="mt-4 text-sm text-muted-foreground">
          Loading step...
        </div>
      ) : !step ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-destructive">
            {loadError || 'Step not found.'}
          </p>
          <Button variant="outline" onClick={() => router.push(backHref)}>
            Back to Flavor Steps
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
            <div>
              <label className="text-sm">
                Model <span className="text-destructive">*</span>
              </label>
              <select
                className={selectClasses()}
                value={modelId ?? ''}
                onChange={(e) =>
                  setModelId(Number(e.target.value) || undefined)
                }
                disabled={isLoadingLookups}
              >
                <option value="">Select model</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm">
                Input Type <span className="text-destructive">*</span>
              </label>
              <select
                className={selectClasses()}
                value={inputTypeId ?? ''}
                onChange={(e) =>
                  setInputTypeId(Number(e.target.value) || undefined)
                }
                disabled={isLoadingLookups}
              >
                <option value="">Select input type</option>
                {inputTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.slug}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm">
                Output Type <span className="text-destructive">*</span>
              </label>
              <select
                className={selectClasses()}
                value={outputTypeId ?? ''}
                onChange={(e) =>
                  setOutputTypeId(Number(e.target.value) || undefined)
                }
                disabled={isLoadingLookups}
              >
                <option value="">Select output type</option>
                {outputTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.slug}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-sm">
                System Prompt <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter the system prompt for this step."
                className="min-h-[180px] resize-y"
              />
            </div>

            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-sm">
                User Prompt <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Enter the user prompt for this step."
                className="min-h-[180px] resize-y"
              />
            </div>

            <div>
              <label className="text-sm">
                Step Type <span className="text-destructive">*</span>
              </label>
              <select
                className={selectClasses()}
                value={stepTypeId ?? ''}
                onChange={(e) =>
                  setStepTypeId(e.target.value ? Number(e.target.value) : null)
                }
                disabled={isLoadingLookups}
              >
                <option value="">Select step type</option>
                {stepTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.slug}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm">
                Temperature{' '}
                {isTemperatureSupported && (
                  <span className="text-destructive">*</span>
                )}
              </label>
              <Input
                className={inputClasses()}
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
                  Must be between 0-2. Higher = more randomness.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm">
                Step <span className="text-destructive">*</span>
              </label>
              <Input
                className={inputClasses()}
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

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push(backHref)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoadingLookups}
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
