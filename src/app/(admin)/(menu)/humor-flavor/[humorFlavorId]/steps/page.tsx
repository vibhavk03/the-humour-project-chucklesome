'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { HumorService } from '@/services/humor.service'
import { HumorFlavorStepsService } from '@/services/humor-flavor-steps.service'
import { HumorFlavorStepTypesService } from '@/services/humor-flavor-step-types.service'
import { LlmService } from '@/services/llm.service'
import type { HumorFlavor } from '@/types/humor-flavor'
import HumorFlavorStep from '@/types/humor-flavor-step'
import HumorFlavorStepType from '@/types/humor-flavor-step-type'
import LlmModel from '@/types/llm-model'
import LlmInputType from '@/types/llm-input-type'
import LlmOutputType from '@/types/llm-output-type'
import DeleteHumorFlavorStepDialog from '@/components/dialog/DeleteHumorFlavorStepDialog'
import DuplicateHumorFlavorDialog from '@/components/dialog/DuplicateHumorFlavorDialog'
import { Plus, Pencil, Eye } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const parseFlavorId = (value: unknown) => {
  const parsed =
    typeof value === 'string' && value.trim() === '' ? NaN : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export default function HumorFlavorStepsPage() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const stepsRequestIdRef = useRef(0)

  const flavorId = useMemo(() => {
    const raw = params?.humorFlavorId
    const value = Array.isArray(raw) ? raw[0] : raw
    const paramId = parseFlavorId(value)
    if (paramId != null) return paramId
    if (!pathname) return null
    const match = pathname.match(/\/humor-flavor\/([^/]+)\/steps/)
    if (!match) return null
    return parseFlavorId(match[1])
  }, [params, pathname])

  const [flavor, setFlavor] = useState<HumorFlavor | null>(null)
  const [loadingFlavor, setLoadingFlavor] = useState(true)

  const [steps, setSteps] = useState<HumorFlavorStep[]>([])
  const [loadingSteps, setLoadingSteps] = useState(false)

  const [modelsMap, setModelsMap] = useState<Record<number, LlmModel>>({})
  const [inputTypesMap, setInputTypesMap] = useState<
    Record<string, LlmInputType>
  >({})
  const [outputTypesMap, setOutputTypesMap] = useState<
    Record<string, LlmOutputType>
  >({})
  const [stepTypesMap, setStepTypesMap] = useState<
    Record<string, HumorFlavorStepType>
  >({})
  const [loadingLookups, setLoadingLookups] = useState(false)
  const [lookupsLoaded, setLookupsLoaded] = useState(false)
  const [duplicatingFlavor, setDuplicatingFlavor] =
    useState<HumorFlavor | null>(null)
  const [promptDialogOpen, setPromptDialogOpen] = useState(false)
  const [promptDialogStepId, setPromptDialogStepId] = useState<number | null>(
    null
  )
  const [promptDialogType, setPromptDialogType] = useState<'system' | 'user'>(
    'system'
  )
  const [promptDialogContent, setPromptDialogContent] = useState<string>('')
  const [promptDialogError, setPromptDialogError] = useState<string | null>(
    null
  )
  const [promptDialogLoading, setPromptDialogLoading] = useState(false)
  const ioTypesRequestIdRef = useRef(0)
  const requestedInputTypeIdsRef = useRef(new Set<string>())
  const requestedOutputTypeIdsRef = useRef(new Set<string>())
  const promptDialogRequestIdRef = useRef(0)

  useEffect(() => {
    if (flavorId == null) {
      setFlavor(null)
      setLoadingFlavor(false)
      return
    }
    let active = true
    const loadFlavor = async () => {
      setLoadingFlavor(true)
      try {
        const data = await HumorService.getAllFlavors()
        if (!active) return
        const match =
          data.find((item) => parseFlavorId(item.id) === flavorId) ?? null
        setFlavor(match)
      } catch (error) {
        if (!active) return
        console.error('Failed to fetch humor flavor:', error)
        toast({ title: 'Failed to load flavor', variant: 'destructive' })
        setFlavor(null)
      } finally {
        if (active) setLoadingFlavor(false)
      }
    }
    loadFlavor()
    return () => {
      active = false
    }
  }, [flavorId, toast])

  useEffect(() => {
    stepsRequestIdRef.current += 1
    if (flavorId == null) {
      setSteps([])
      setLoadingSteps(false)
      return
    }
    setSteps([])
    setLoadingSteps(true)
  }, [flavorId])

  const fetchSteps = useCallback(async () => {
    if (flavorId == null) return
    const requestId = ++stepsRequestIdRef.current
    setLoadingSteps(true)
    try {
      const data = await HumorFlavorStepsService.getStepsByFlavor(flavorId)
      if (stepsRequestIdRef.current !== requestId) return
      setSteps(Array.isArray(data) ? data : [])
    } catch (e) {
      if (stepsRequestIdRef.current !== requestId) return
      toast({ title: 'Unable to load steps', variant: 'destructive' })
      setSteps([])
    } finally {
      if (stepsRequestIdRef.current === requestId) {
        setLoadingSteps(false)
      }
    }
  }, [flavorId, toast])

  useEffect(() => {
    if (flavorId != null) {
      fetchSteps()
    }
  }, [flavorId, fetchSteps])

  useEffect(() => {
    if (flavorId == null || lookupsLoaded || loadingLookups) {
      return
    }
    let active = true
    const loadLookups = async () => {
      setLoadingLookups(true)
      try {
        const [models, inputs, outputs, stepTypes] = await Promise.all([
          LlmService.getAllModels(),
          LlmService.getAllInputTypes(),
          LlmService.getAllOutputTypes(),
          HumorFlavorStepTypesService.getAll(),
        ])
        if (!active) return
        setModelsMap(Object.fromEntries(models.map((m) => [m.id, m])))
        setInputTypesMap(
          Object.fromEntries(inputs.map((t) => [String(t.id), t]))
        )
        setOutputTypesMap(
          Object.fromEntries(outputs.map((t) => [String(t.id), t]))
        )
        const nextStepTypesMap: Record<string, HumorFlavorStepType> = {}
        stepTypes.forEach((stepType) => {
          nextStepTypesMap[String(stepType.id)] = stepType
        })
        setStepTypesMap(nextStepTypesMap)
      } catch (e) {
        if (active) {
          toast({ title: 'Failed to load lookups', variant: 'destructive' })
        }
      } finally {
        if (active) {
          setLoadingLookups(false)
          setLookupsLoaded(true)
        }
      }
    }
    loadLookups()
    return () => {
      active = false
    }
  }, [flavorId, lookupsLoaded, loadingLookups, toast])

  const showStepsLoading = flavorId != null ? loadingSteps : false

  useEffect(() => {
    if (steps.length === 0) return
    const missingInputTypeIds = new Set<string>()
    const missingOutputTypeIds = new Set<string>()
    steps.forEach((step) => {
      const inputTypeId = step.llm_input_type_id
      if (inputTypeId != null) {
        const key = String(inputTypeId)
        if (
          key &&
          !inputTypesMap[key] &&
          !requestedInputTypeIdsRef.current.has(key)
        ) {
          missingInputTypeIds.add(key)
        }
      }
      const outputTypeId = step.llm_output_type_id
      if (outputTypeId != null) {
        const key = String(outputTypeId)
        if (
          key &&
          !outputTypesMap[key] &&
          !requestedOutputTypeIdsRef.current.has(key)
        ) {
          missingOutputTypeIds.add(key)
        }
      }
    })
    if (missingInputTypeIds.size === 0 && missingOutputTypeIds.size === 0)
      return
    const requestId = ++ioTypesRequestIdRef.current
    let active = true
    missingInputTypeIds.forEach((id) =>
      requestedInputTypeIdsRef.current.add(id)
    )
    missingOutputTypeIds.forEach((id) =>
      requestedOutputTypeIdsRef.current.add(id)
    )
    const loadMissingIoTypes = async () => {
      const [inputTypes, outputTypes] = await Promise.all([
        missingInputTypeIds.size > 0
          ? LlmService.getInputTypesByIds(Array.from(missingInputTypeIds))
          : Promise.resolve([]),
        missingOutputTypeIds.size > 0
          ? LlmService.getOutputTypesByIds(Array.from(missingOutputTypeIds))
          : Promise.resolve([]),
      ])
      if (!active || ioTypesRequestIdRef.current !== requestId) return
      if (inputTypes.length > 0) {
        setInputTypesMap((prev) => {
          const next = { ...prev }
          inputTypes.forEach((inputType) => {
            if (inputType?.id == null) return
            next[String(inputType.id)] = inputType
          })
          return next
        })
      }
      if (outputTypes.length > 0) {
        setOutputTypesMap((prev) => {
          const next = { ...prev }
          outputTypes.forEach((outputType) => {
            if (outputType?.id == null) return
            next[String(outputType.id)] = outputType
          })
          return next
        })
      }
    }
    loadMissingIoTypes()
    return () => {
      active = false
    }
  }, [steps, inputTypesMap, outputTypesMap])

  const openPromptDialog = useCallback(
    (stepId: number, type: 'system' | 'user') => {
      setPromptDialogStepId(stepId)
      setPromptDialogType(type)
      setPromptDialogOpen(true)
    },
    []
  )

  useEffect(() => {
    if (!promptDialogOpen || promptDialogStepId == null) return
    const requestId = ++promptDialogRequestIdRef.current
    let active = true
    setPromptDialogLoading(true)
    setPromptDialogError(null)
    setPromptDialogContent('')
    const loadPrompt = async () => {
      try {
        const step =
          await HumorFlavorStepsService.getStepById(promptDialogStepId)
        if (!active || promptDialogRequestIdRef.current !== requestId) return
        if (!step) {
          setPromptDialogError('Prompt not found.')
          return
        }
        const promptValue =
          promptDialogType === 'system'
            ? step.llm_system_prompt
            : step.llm_user_prompt
        setPromptDialogContent(promptValue ?? '')
      } catch (error) {
        if (!active || promptDialogRequestIdRef.current !== requestId) return
        setPromptDialogError('Unable to load prompt.')
      } finally {
        if (active && promptDialogRequestIdRef.current === requestId) {
          setPromptDialogLoading(false)
        }
      }
    }
    loadPrompt()
    return () => {
      active = false
    }
  }, [promptDialogOpen, promptDialogStepId, promptDialogType])

  const handlePromptDialogChange = useCallback((open: boolean) => {
    setPromptDialogOpen(open)
    if (!open) {
      setPromptDialogStepId(null)
      setPromptDialogContent('')
      setPromptDialogError(null)
      setPromptDialogLoading(false)
    }
  }, [])

  if (flavorId == null) {
    return (
      <div className="page-shell">
        <Card className="p-6">
          <CardHeader className="p-0">
            <CardTitle>Invalid humor flavor</CardTitle>
            <CardDescription>
              Select a flavor from the list to manage steps.
            </CardDescription>
          </CardHeader>
          <div className="mt-4">
            <Button asChild>
              <Link href="/humor-flavors">Back to Humor Flavors</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const flavorLabel =
    flavor?.slug ??
    (loadingFlavor ? 'Loading flavor...' : `Flavor #${flavorId}`)

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <Button variant="outline" size="sm" asChild>
            <Link href="/humor-flavors">&larr; Back to All Flavors</Link>
          </Button>
          <h1 className="page-title mt-2">Manage Steps for: {flavorLabel}</h1>
          <p className="page-subtitle">
            Adjust the pipeline order and configuration for this flavor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (flavor) {
                setDuplicatingFlavor(flavor)
              }
            }}
            disabled={!flavor || loadingFlavor}
          >
            Duplicate Flavor
          </Button>
          <Button asChild>
            <Link href={`/humor-flavor/${flavorId}/steps/new`}>
              <Plus className="h-4 w-4" />
              <span className="ml-2">Add Humor Flavor Step</span>
            </Link>
          </Button>
        </div>
      </div>
      <Separator />
      {showStepsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : steps.length === 0 ? (
        <Card className="p-6">
          <CardHeader className="p-0">
            <CardTitle>No steps found</CardTitle>
            <CardDescription>
              This flavor has no steps yet. Add one to get started.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {steps.map((step) => {
            const model = modelsMap[step.llm_model_id]
            const modelName =
              step.llm_models?.name || model?.name || 'Unknown model'
            const modelProviderId =
              step.llm_models?.provider_model_id ||
              model?.provider_model_id ||
              'N/A'
            const stepTypeId = step.humor_flavor_step_type_id ?? null
            const stepTypeKey = stepTypeId != null ? String(stepTypeId) : null
            const stepType = stepTypeKey ? stepTypesMap[stepTypeKey] : null
            const stepTypeLookup = step.humor_flavor_step_types
            const stepTypeDetails = Array.isArray(stepTypeLookup)
              ? stepTypeLookup[0]
              : stepTypeLookup
            const stepTypeName =
              stepTypeDetails?.name ||
              stepTypeDetails?.slug ||
              stepType?.name ||
              stepType?.slug
            const stepTypeLabel =
              stepTypeName || (stepTypeId != null ? `#${stepTypeId}` : 'N/A')
            const stepTypeTitle =
              stepTypeDetails?.description ||
              stepType?.description ||
              stepTypeDetails?.name ||
              stepType?.name ||
              stepTypeDetails?.slug ||
              stepType?.slug ||
              ''
            const inputTypeKey =
              step.llm_input_type_id != null
                ? String(step.llm_input_type_id)
                : null
            const outputTypeKey =
              step.llm_output_type_id != null
                ? String(step.llm_output_type_id)
                : null
            const inputType = inputTypeKey ? inputTypesMap[inputTypeKey] : null
            const outputType = outputTypeKey
              ? outputTypesMap[outputTypeKey]
              : null
            const temperatureLabel = model
              ? model.is_temperature_supported
                ? (step.llm_temperature ?? 'N/A')
                : 'Not supported'
              : (step.llm_temperature ?? 'N/A')
            const hasSystemPrompt = Boolean(step.llm_system_prompt?.trim())
            const hasUserPrompt = Boolean(step.llm_user_prompt?.trim())

            return (
              <Card key={step.id} className="p-4">
                <div className="text-2xl font-semibold text-foreground">
                  Step Number: {step.order_by}
                </div>
                <dl className="mt-3 space-y-3 text-sm">
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">Step ID</dt>
                    <dd className="font-medium">#{step.id}</dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">LLM Model</dt>
                    <dd className="font-medium">{modelName}</dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">LLM Model ID</dt>
                    <dd className="font-medium">{modelProviderId}</dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">Step type</dt>
                    <dd className="font-medium" title={stepTypeTitle}>
                      {stepTypeLabel}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">Input type</dt>
                    <dd
                      className="font-medium"
                      title={inputType?.description || ''}
                    >
                      {inputType?.slug || `#${step.llm_input_type_id}`}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">Output type</dt>
                    <dd
                      className="font-medium"
                      title={outputType?.description || ''}
                    >
                      {outputType?.slug || `#${step.llm_output_type_id}`}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">System prompt</dt>
                    <dd className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 font-medium text-muted-foreground">
                          {hasSystemPrompt ? '' : '—'}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0"
                          aria-label="View system prompt"
                          onClick={() => openPromptDialog(step.id, 'system')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">User prompt</dt>
                    <dd className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 font-medium text-muted-foreground">
                          {hasUserPrompt ? '' : '—'}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0"
                          aria-label="View user prompt"
                          onClick={() => openPromptDialog(step.id, 'user')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[120px,1fr] gap-2">
                    <dt className="text-muted-foreground">Temperature</dt>
                    <dd className="font-medium">{temperatureLabel}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 [&_svg]:size-5"
                    asChild
                  >
                    <Link
                      href={`/humor-flavor/${flavorId}/steps/${step.id}/edit`}
                      aria-label={`Edit step ${step.id}`}
                    >
                      <Pencil className="h-5 w-5" />
                    </Link>
                  </Button>
                  <DeleteHumorFlavorStepDialog
                    stepId={step.id}
                    onStepDeleted={fetchSteps}
                  />
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <DuplicateHumorFlavorDialog
        flavor={duplicatingFlavor}
        onOpenChange={() => setDuplicatingFlavor(null)}
        onSuccess={(createdFlavor) => {
          if (createdFlavor?.id != null) {
            router.push(`/humor-flavor/${createdFlavor.id}/steps`)
          }
        }}
      />
      <Dialog open={promptDialogOpen} onOpenChange={handlePromptDialogChange}>
        <DialogContent className="max-w-3xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {promptDialogType === 'system' ? 'System Prompt' : 'User Prompt'}
            </DialogTitle>
            {promptDialogStepId != null ? (
              <DialogDescription>Step #{promptDialogStepId}</DialogDescription>
            ) : null}
          </DialogHeader>
          {promptDialogLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading prompt...
            </div>
          ) : promptDialogError ? (
            <div className="text-sm text-destructive">{promptDialogError}</div>
          ) : (
            <div className="whitespace-pre-wrap text-sm">
              {promptDialogContent || 'Prompt not set.'}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
