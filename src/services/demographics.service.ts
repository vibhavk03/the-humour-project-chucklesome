import { supabase } from '@/utils/supabase/client'
import type { Database } from '@/types/supabase'
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from '@/utils/supabase/audit'

export type DemographicQuestion =
  Database['public']['Tables']['demographic_questions']['Row']
export type DemographicAnswer =
  Database['public']['Tables']['demographic_answers']['Row']
export type DemographicMapping =
  Database['public']['Tables']['demographic_answer_question_mapping']['Row']
export type DemographicResponse =
  Database['public']['Tables']['demographic_user_responses']['Row']
export type DemographicProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'email' | 'first_name' | 'last_name'
>

async function auditUserId() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return getCurrentProfileId(supabase)
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

type DatabaseError = { code?: string; message?: string }

const isPrimaryKeyConflict = (error: DatabaseError | null) =>
  error?.code === '23505' &&
  (error.message?.toLowerCase().includes('pkey') ||
    error.message?.toLowerCase().includes('primary key'))

async function retryAllocatedInsert(
  insert: (firstId: number) => Promise<DatabaseError | null>,
  getNextId: () => Promise<number>
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const error = await insert(await getNextId())
    if (!error) return
    if (!isPrimaryKeyConflict(error) || attempt === 4) throw error
  }
}

export class DemographicsService {
  static async listQuestions() {
    const { data, error } = await requireClient()
      .from('demographic_questions')
      .select('*')
      .order('id')
    if (error) throw error
    return data
  }

  static async createQuestion(question: string) {
    const client = requireClient()
    const profileId = await auditUserId()
    await retryAllocatedInsert(
      async (id) => {
        const { error } = await client
          .from('demographic_questions')
          .insert(applyInsertAuditFields({ id, question }, profileId))
        return error
      },
      () => this.nextQuestionId()
    )
  }

  static async createQuestions(questions: string[]) {
    const client = requireClient()
    const profileId = await auditUserId()
    await retryAllocatedInsert(
      async (firstId) => {
        const { error } = await client.from('demographic_questions').insert(
          applyInsertAuditFields(
            questions.map((question, index) => ({
              id: firstId + index,
              question,
            })),
            profileId
          )
        )
        return error
      },
      () => this.nextQuestionId()
    )
  }

  static async updateQuestion(id: number, question: string) {
    const client = requireClient()
    const profileId = await auditUserId()
    const { error } = await client
      .from('demographic_questions')
      .update(applyUpdateAuditFields({ question }, profileId))
      .eq('id', id)
    if (error) throw error
  }

  static async deleteQuestion(id: number) {
    const { error } = await requireClient()
      .from('demographic_questions')
      .delete()
      .eq('id', id)
    if (error) throw error
  }

  static async listAnswers() {
    const { data, error } = await requireClient()
      .from('demographic_answers')
      .select('*')
      .order('id')
    if (error) throw error
    return data
  }

  static async createAnswer(answer: string) {
    const client = requireClient()
    const profileId = await auditUserId()
    await retryAllocatedInsert(
      async (id) => {
        const { error } = await client
          .from('demographic_answers')
          .insert(applyInsertAuditFields({ id, answer }, profileId))
        return error
      },
      () => this.nextAnswerId()
    )
  }

  static async createAnswers(answers: string[]) {
    const client = requireClient()
    const profileId = await auditUserId()
    await retryAllocatedInsert(
      async (firstId) => {
        const { error } = await client.from('demographic_answers').insert(
          applyInsertAuditFields(
            answers.map((answer, index) => ({
              id: firstId + index,
              answer,
            })),
            profileId
          )
        )
        return error
      },
      () => this.nextAnswerId()
    )
  }

  static async updateAnswer(id: number, answer: string) {
    const client = requireClient()
    const profileId = await auditUserId()
    const { error } = await client
      .from('demographic_answers')
      .update(applyUpdateAuditFields({ answer }, profileId))
      .eq('id', id)
    if (error) throw error
  }

  static async deleteAnswer(id: number) {
    const { error } = await requireClient()
      .from('demographic_answers')
      .delete()
      .eq('id', id)
    if (error) throw error
  }

  static async listMappings() {
    const { data, error } = await requireClient()
      .from('demographic_answer_question_mapping')
      .select('*')
      .order('id')
    if (error) throw error
    return data
  }

  static async createMapping(
    values: Pick<
      DemographicMapping,
      'question_id' | 'answer_id' | 'display_order' | 'is_deleted'
    >
  ) {
    const client = requireClient()
    const profileId = await auditUserId()
    await retryAllocatedInsert(
      async (id) => {
        const { error } = await client
          .from('demographic_answer_question_mapping')
          .insert(applyInsertAuditFields({ ...values, id }, profileId))
        return error
      },
      () => this.nextMappingId()
    )
  }

  static async createMappings(
    values: Pick<
      DemographicMapping,
      'question_id' | 'answer_id' | 'display_order' | 'is_deleted'
    >[]
  ) {
    const client = requireClient()
    const profileId = await auditUserId()
    await retryAllocatedInsert(
      async (firstId) => {
        const { error } = await client
          .from('demographic_answer_question_mapping')
          .insert(
            applyInsertAuditFields(
              values.map((value, index) => ({
                ...value,
                id: firstId + index,
              })),
              profileId
            )
          )
        return error
      },
      () => this.nextMappingId()
    )
  }

  static async updateMapping(
    id: number,
    values: Pick<
      DemographicMapping,
      'question_id' | 'answer_id' | 'display_order' | 'is_deleted'
    >
  ) {
    const client = requireClient()
    const profileId = await auditUserId()
    const { error } = await client
      .from('demographic_answer_question_mapping')
      .update(applyUpdateAuditFields(values, profileId))
      .eq('id', id)
    if (error) throw error
  }

  static async updateMappings(
    values: Pick<
      DemographicMapping,
      'id' | 'question_id' | 'answer_id' | 'display_order' | 'is_deleted'
    >[]
  ) {
    if (!values.length) return
    const client = requireClient()
    const profileId = await auditUserId()
    const { error } = await client
      .from('demographic_answer_question_mapping')
      .upsert(
        values.map((value) => applyUpdateAuditFields(value, profileId)),
        { onConflict: 'id' }
      )
    if (error) throw error
  }

  static async deleteMapping(id: number) {
    const { error } = await requireClient()
      .from('demographic_answer_question_mapping')
      .delete()
      .eq('id', id)
    if (error) throw error
  }

  static async listResponses() {
    const { data, error } = await requireClient()
      .from('demographic_user_responses')
      .select('*')
      .order('id')
    if (error) throw error
    return data
  }

  static async createResponse(
    values: Pick<DemographicResponse, 'user_id' | 'answer_question_mapping_id'>
  ) {
    const client = requireClient()
    await retryAllocatedInsert(
      async (id) => {
        const { error } = await client
          .from('demographic_user_responses')
          .insert({ ...values, id })
        return error
      },
      () => this.nextResponseId()
    )
  }

  static async createResponses(
    values: Pick<
      DemographicResponse,
      'user_id' | 'answer_question_mapping_id'
    >[]
  ) {
    const client = requireClient()
    await retryAllocatedInsert(
      async (firstId) => {
        const { error } = await client
          .from('demographic_user_responses')
          .insert(
            values.map((value, index) => ({ ...value, id: firstId + index }))
          )
        return error
      },
      () => this.nextResponseId()
    )
  }

  private static async nextQuestionId() {
    const { data, error } = await requireClient()
      .from('demographic_questions')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
    if (error) throw error
    return (data[0]?.id ?? -1) + 1
  }

  private static async nextAnswerId() {
    const { data, error } = await requireClient()
      .from('demographic_answers')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
    if (error) throw error
    return (data[0]?.id ?? -1) + 1
  }

  private static async nextMappingId() {
    const { data, error } = await requireClient()
      .from('demographic_answer_question_mapping')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
    if (error) throw error
    return (data[0]?.id ?? -1) + 1
  }

  private static async nextResponseId() {
    const { data, error } = await requireClient()
      .from('demographic_user_responses')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
    if (error) throw error
    return (data[0]?.id ?? -1) + 1
  }

  static async deleteMany(
    kind: 'questions' | 'answers' | 'mappings' | 'responses',
    ids: number[]
  ) {
    if (!ids.length) return
    const client = requireClient()
    const query =
      kind === 'questions'
        ? client.from('demographic_questions').delete().in('id', ids)
        : kind === 'answers'
          ? client.from('demographic_answers').delete().in('id', ids)
          : kind === 'mappings'
            ? client
                .from('demographic_answer_question_mapping')
                .delete()
                .in('id', ids)
            : client.from('demographic_user_responses').delete().in('id', ids)
    const { error } = await query
    if (error) throw error
  }

  static async setMappingsDeleted(ids: number[], isDeleted: boolean) {
    if (!ids.length) return
    const client = requireClient()
    const profileId = await auditUserId()
    const { error } = await client
      .from('demographic_answer_question_mapping')
      .update(applyUpdateAuditFields({ is_deleted: isDeleted }, profileId))
      .in('id', ids)
    if (error) throw error
  }

  static async updateResponse(
    id: number,
    values: Pick<DemographicResponse, 'user_id' | 'answer_question_mapping_id'>
  ) {
    const { error } = await requireClient()
      .from('demographic_user_responses')
      .update({ ...values, modified_datetime_utc: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  }

  static async deleteResponse(id: number) {
    const { error } = await requireClient()
      .from('demographic_user_responses')
      .delete()
      .eq('id', id)
    if (error) throw error
  }

  static async listProfiles() {
    const { data, error } = await requireClient()
      .from('profiles')
      .select('id, email, first_name, last_name')
      .order('email')
    if (error) throw error
    return data
  }
}
