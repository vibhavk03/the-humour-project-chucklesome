import { supabase } from '@/utils/supabase/client'
import {
  HumorFlavorStep,
  HumorFlavorStepInsert,
  HumorFlavorStepUpdate,
} from '@/types/humor-flavor-step'
import { HumorFlavorStepTypesService } from '@/services/humor-flavor-step-types.service'
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from '@/utils/supabase/audit'

type HumorFlavorStepCloneFields = Pick<
  HumorFlavorStep,
  | 'humor_flavor_step_type_id'
  | 'llm_model_id'
  | 'llm_input_type_id'
  | 'llm_output_type_id'
  | 'llm_system_prompt'
  | 'llm_user_prompt'
  | 'llm_temperature'
  | 'order_by'
>

export class HumorFlavorStepsService {
  static async getStepsByFlavor(
    humorFlavorId: number
  ): Promise<HumorFlavorStep[]> {
    const client = supabase
    if (!client) return []
    try {
      const baseQuery = (select: string) =>
        client
          .from('humor_flavor_steps')
          .select<string, HumorFlavorStep>(select)
          .eq('humor_flavor_id', humorFlavorId)
          .order('order_by', { ascending: true })
          .order('id', { ascending: true })

      const baseSelectParts = ['*', 'llm_models ( name, provider_model_id )']
      const stepTypeSelects = [
        'humor_flavor_step_types:humor_flavor_step_types!humor_flavor_step_type_id ( id, slug, description )',
        'humor_flavor_step_types:humor_flavor_step_type!humor_flavor_step_type_id ( id, slug, description )',
        'humor_flavor_step_types ( id, slug, description )',
      ]

      let steps: HumorFlavorStep[] = []
      for (const stepTypeSelect of stepTypeSelects) {
        const { data, error } = await baseQuery(
          [...baseSelectParts, stepTypeSelect].join(',\n')
        )
        if (!error) {
          steps = (data || []) as HumorFlavorStep[]
          break
        }
      }

      if (steps.length === 0) {
        const fallback = await baseQuery(baseSelectParts.join(',\n'))
        if (fallback.error) {
          console.error('Error fetching humor flavor steps:', fallback.error)
          return []
        }
        steps = (fallback.data || []) as HumorFlavorStep[]
      }

      const hasEmbeddedStepTypes = steps.some((step) => {
        const embedded = step.humor_flavor_step_types
        return Array.isArray(embedded) ? embedded.length > 0 : Boolean(embedded)
      })

      if (!hasEmbeddedStepTypes && steps.length > 0) {
        const stepTypes = await HumorFlavorStepTypesService.getAll()
        if (stepTypes.length > 0) {
          const stepTypesMap = new Map(
            stepTypes.map((stepType) => [String(stepType.id), stepType])
          )
          steps = steps.map((step) => {
            const stepTypeId = step.humor_flavor_step_type_id
            if (stepTypeId == null) return step
            const stepType = stepTypesMap.get(String(stepTypeId))
            if (!stepType) return step
            return { ...step, humor_flavor_step_types: stepType }
          })
        }
      }

      return steps
    } catch (error) {
      console.error('Error fetching humor flavor steps:', error)
      return []
    }
  }

  static async getStepsByIds(stepIds: number[]): Promise<HumorFlavorStep[]> {
    const client = supabase
    if (!client) return []
    const cleanedIds = Array.from(
      new Set(stepIds.filter((id) => Number.isFinite(id)))
    )
    if (cleanedIds.length === 0) return []
    try {
      const baseQuery = (select: string) =>
        client
          .from('humor_flavor_steps')
          .select<string, HumorFlavorStep>(select)
          .in('id', cleanedIds)
          .order('order_by', { ascending: true })
          .order('id', { ascending: true })

      const baseSelectParts = ['*', 'llm_models ( name, provider_model_id )']
      const stepTypeSelects = [
        'humor_flavor_step_types:humor_flavor_step_types!humor_flavor_step_type_id ( id, slug, description )',
        'humor_flavor_step_types:humor_flavor_step_type!humor_flavor_step_type_id ( id, slug, description )',
        'humor_flavor_step_types ( id, slug, description )',
      ]

      let steps: HumorFlavorStep[] = []
      for (const stepTypeSelect of stepTypeSelects) {
        const { data, error } = await baseQuery(
          [...baseSelectParts, stepTypeSelect].join(',\n')
        )
        if (!error) {
          steps = (data || []) as HumorFlavorStep[]
          break
        }
      }

      if (steps.length === 0) {
        const fallback = await baseQuery(baseSelectParts.join(',\n'))
        if (fallback.error) {
          console.error('Error fetching humor flavor steps:', fallback.error)
          return []
        }
        steps = (fallback.data || []) as HumorFlavorStep[]
      }

      const hasEmbeddedStepTypes = steps.some((step) => {
        const embedded = step.humor_flavor_step_types
        return Array.isArray(embedded) ? embedded.length > 0 : Boolean(embedded)
      })

      if (!hasEmbeddedStepTypes && steps.length > 0) {
        const stepTypes = await HumorFlavorStepTypesService.getAll()
        if (stepTypes.length > 0) {
          const stepTypesMap = new Map(
            stepTypes.map((stepType) => [String(stepType.id), stepType])
          )
          steps = steps.map((step) => {
            const stepTypeId = step.humor_flavor_step_type_id
            if (stepTypeId == null) return step
            const stepType = stepTypesMap.get(String(stepTypeId))
            if (!stepType) return step
            return { ...step, humor_flavor_step_types: stepType }
          })
        }
      }

      return steps
    } catch (error) {
      console.error('Error fetching humor flavor steps:', error)
      return []
    }
  }

  static async duplicateStepsForFlavor(
    sourceFlavorId: number,
    targetFlavorId: number
  ) {
    if (!supabase) return { error: 'Supabase client not available' }
    try {
      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .select(
          'humor_flavor_step_type_id, llm_model_id, llm_input_type_id, llm_output_type_id, llm_system_prompt, llm_user_prompt, llm_temperature, order_by'
        )
        .eq('humor_flavor_id', sourceFlavorId)
        .order('order_by', { ascending: true })
        .order('id', { ascending: true })

      if (error) {
        console.error('Error fetching humor flavor steps to duplicate:', error)
        return { error }
      }

      const stepsToCopy = (data || []) as HumorFlavorStepCloneFields[]
      if (stepsToCopy.length === 0) {
        return { data: [] as HumorFlavorStep[] }
      }

      const payloads = stepsToCopy.map((step) => ({
        ...step,
        humor_flavor_id: targetFlavorId,
      }))
      const profileId = await getCurrentProfileId(supabase)

      const { data: inserted, error: insertError } = await supabase
        .from('humor_flavor_steps')
        .insert(applyInsertAuditFields(payloads, profileId))
        .select('*')

      if (insertError) {
        console.error('Error duplicating humor flavor steps:', insertError)
        return { error: insertError }
      }

      return { data: (inserted || []) as HumorFlavorStep[] }
    } catch (error) {
      console.error('Error duplicating humor flavor steps:', error)
      return { error }
    }
  }

  static async getAllSteps(): Promise<HumorFlavorStep[]> {
    if (!supabase) return []
    try {
      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .select('*')
        .order('order_by', { ascending: true })
        .order('id', { ascending: true })
      if (error) {
        console.error('Error fetching all humor flavor steps:', error)
        return []
      }
      return (data || []) as HumorFlavorStep[]
    } catch (error) {
      console.error('Error fetching all humor flavor steps:', error)
      return []
    }
  }

  static async getStepById(stepId: number): Promise<HumorFlavorStep | null> {
    if (!supabase) return null
    try {
      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .select('*')
        .eq('id', stepId)
        .single()

      if (error) {
        console.error('Error fetching humor flavor step:', error)
        return null
      }
      return (data || null) as HumorFlavorStep | null
    } catch (error) {
      console.error('Error fetching humor flavor step:', error)
      return null
    }
  }

  static async getMostRecentFlavorIdWithSteps(): Promise<number | null> {
    if (!supabase) return null
    try {
      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .select('humor_flavor_id')
        .order('id', { ascending: false })
        .limit(1)

      if (error) {
        console.error('Error fetching recent flavor id:', error)
        return null
      }
      return data?.[0]?.humor_flavor_id ?? null
    } catch (error) {
      console.error('Error fetching recent flavor id:', error)
      return null
    }
  }

  static async createStep(
    payload: HumorFlavorStepInsert
  ) {
    if (!supabase) return { error: 'Supabase client not available' }
    try {
      const profileId = await getCurrentProfileId(supabase)
      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .insert(applyInsertAuditFields([{ ...payload }], profileId))
        .select('*')

      if (error) {
        console.error('Error creating humor flavor step:', error)
        return { error }
      }
      return { data: data?.[0] as HumorFlavorStep }
    } catch (error) {
      console.error('Error creating humor flavor step:', error)
      return { error }
    }
  }

  static async updateStep(stepId: number, updates: HumorFlavorStepUpdate) {
    if (!supabase) return { error: 'Supabase client not available' }
    try {
      const profileId = await getCurrentProfileId(supabase)
      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .update(applyUpdateAuditFields({ ...updates }, profileId))
        .eq('id', stepId)
        .select('*')

      if (error) {
        console.error('Error updating humor flavor step:', error)
        return { error }
      }
      return { data: data?.[0] as HumorFlavorStep }
    } catch (error) {
      console.error('Error updating humor flavor step:', error)
      return { error }
    }
  }

  static async deleteStep(stepId: number) {
    if (!supabase) return { error: 'Supabase client not available' }
    try {
      const { error } = await supabase
        .from('humor_flavor_steps')
        .delete()
        .eq('id', stepId)

      if (error) {
        console.error('Error deleting humor flavor step:', error)
        return { error }
      }
      return { success: true } as const
    } catch (error) {
      console.error('Error deleting humor flavor step:', error)
      return { error }
    }
  }

  static async setStepOrder(stepId: number, newOrder: number) {
    if (!supabase) return { error: 'Supabase client not available' }
    try {
      const profileId = await getCurrentProfileId(supabase)
      const { data, error } = await supabase
        .from('humor_flavor_steps')
        .update(
          applyUpdateAuditFields(
            {
              order_by: newOrder,
            },
            profileId
          )
        )
        .eq('id', stepId)
        .select('*')

      if (error) {
        console.error('Error setting humor flavor step order:', error)
        return { error }
      }
      return { data: data?.[0] as HumorFlavorStep }
    } catch (error) {
      console.error('Error setting humor flavor step order:', error)
      return { error }
    }
  }

  static async swapStepOrder(stepAId: number, stepBId: number) {
    if (!supabase) return { error: 'Supabase client not available' }
    try {
      const profileId = await getCurrentProfileId(supabase)
      // Fetch current orders
      const { data: steps } = await supabase
        .from('humor_flavor_steps')
        .select('id, order_by')
        .in('id', [stepAId, stepBId])

      const a = steps?.find((s) => s.id === stepAId) as
        | { id: number; order_by: number }
        | undefined
      const b = steps?.find((s) => s.id === stepBId) as
        | { id: number; order_by: number }
        | undefined
      if (!a || !b) return { error: 'Steps not found' }

      // Update in two calls to keep it simple; consumers will refresh list after
      const { error: errA } = await supabase
        .from('humor_flavor_steps')
        .update(
          applyUpdateAuditFields(
            {
              order_by: b.order_by,
            },
            profileId
          )
        )
        .eq('id', stepAId)
      if (errA) return { error: errA }

      const { error: errB } = await supabase
        .from('humor_flavor_steps')
        .update(
          applyUpdateAuditFields(
            {
              order_by: a.order_by,
            },
            profileId
          )
        )
        .eq('id', stepBId)
      if (errB) return { error: errB }

      return { success: true } as const
    } catch (error) {
      console.error('Error swapping humor flavor step order:', error)
      return { error }
    }
  }
}
