import type { Database } from '@/types/supabase'
import { supabase } from '@/utils/supabase/client'
import {
  applyInsertAuditFields,
  applyUpdateAuditFields,
  getCurrentProfileId,
} from '@/utils/supabase/audit'

type WhitelistEmailAddressRow =
  Database['public']['Tables']['whitelist_email_addresses']['Row']

export type WhitelistEmailAddress = Pick<
  WhitelistEmailAddressRow,
  'id' | 'email_address'
>

export type WhitelistEmailMutationResult =
  | { ok: true }
  | { ok: false; message: string; code?: string }

const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SupabaseErrorShape = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function parseSupabaseError(error: unknown): {
  code?: string
  message: string
  details?: string
  hint?: string
} {
  if (error instanceof Error) {
    return { message: error.message || 'Unknown error' }
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as SupabaseErrorShape
    const code = typeof candidate.code === 'string' ? candidate.code : undefined
    const message =
      typeof candidate.message === 'string' && candidate.message.trim()
        ? candidate.message
        : 'Unknown error'
    const details =
      typeof candidate.details === 'string' ? candidate.details : undefined
    const hint = typeof candidate.hint === 'string' ? candidate.hint : undefined

    return { code, message, details, hint }
  }

  if (typeof error === 'string') {
    return { message: error }
  }

  return { message: 'Unknown error' }
}

function formatUserFacingMessage(parsed: {
  code?: string
  message: string
  details?: string
  hint?: string
}) {
  if (parsed.code === '23505') {
    return 'That e-mail address is already on the whitelist.'
  }

  if (parsed.code === '42501') {
    return 'Permission denied by database policy. Please add RLS policies for this table.'
  }

  const parts = [parsed.message, parsed.details, parsed.hint].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')

  return 'Request failed unexpectedly.'
}

function buildFailure(
  context: string,
  error: unknown
): WhitelistEmailMutationResult {
  const parsed = parseSupabaseError(error)
  console.error(context, {
    code: parsed.code,
    message: parsed.message,
    details: parsed.details,
    hint: parsed.hint,
  })

  return {
    ok: false,
    code: parsed.code,
    message: formatUserFacingMessage(parsed),
  }
}

export class WhitelistEmailAddressesService {
  static async list(): Promise<WhitelistEmailAddress[]> {
    if (!supabase) return []

    try {
      const { data, error } = await supabase
        .from('whitelist_email_addresses')
        .select('id, email_address')
        .order('id', { ascending: true })

      if (error) {
        const parsed = parseSupabaseError(error)
        console.error('Error fetching whitelist email addresses:', {
          code: parsed.code,
          message: parsed.message,
          details: parsed.details,
          hint: parsed.hint,
        })
        return []
      }

      return data || []
    } catch (error) {
      const parsed = parseSupabaseError(error)
      console.error('Unexpected error fetching whitelist email addresses:', {
        code: parsed.code,
        message: parsed.message,
        details: parsed.details,
        hint: parsed.hint,
      })
      return []
    }
  }

  static async add(emailAddress: string): Promise<WhitelistEmailMutationResult> {
    if (!supabase) {
      return { ok: false, message: 'Supabase client is not available.' }
    }

    const cleaned = emailAddress.trim().toLowerCase()
    if (!cleaned) {
      return { ok: false, message: 'E-mail address is required.' }
    }
    if (!EMAIL_ADDRESS_REGEX.test(cleaned)) {
      return { ok: false, message: 'Please enter a valid e-mail address.' }
    }

    try {
      const profileId = await getCurrentProfileId(supabase)
      const { error } = await supabase
        .from('whitelist_email_addresses')
        .insert(
          applyInsertAuditFields(
            {
              email_address: cleaned,
            },
            profileId
          )
        )

      if (error) {
        return buildFailure('Error adding whitelist email address:', error)
      }

      return { ok: true }
    } catch (error) {
      return buildFailure('Unexpected error adding whitelist email address:', error)
    }
  }

  static async update(
    id: number,
    emailAddress: string
  ): Promise<WhitelistEmailMutationResult> {
    if (!supabase) {
      return { ok: false, message: 'Supabase client is not available.' }
    }

    const cleaned = emailAddress.trim().toLowerCase()
    if (!cleaned) {
      return { ok: false, message: 'E-mail address is required.' }
    }
    if (!EMAIL_ADDRESS_REGEX.test(cleaned)) {
      return { ok: false, message: 'Please enter a valid e-mail address.' }
    }

    try {
      const profileId = await getCurrentProfileId(supabase)
      const { error } = await supabase
        .from('whitelist_email_addresses')
        .update(
          applyUpdateAuditFields(
            {
              email_address: cleaned,
            },
            profileId
          )
        )
        .eq('id', id)

      if (error) {
        return buildFailure('Error updating whitelist email address:', error)
      }

      return { ok: true }
    } catch (error) {
      return buildFailure(
        'Unexpected error updating whitelist email address:',
        error
      )
    }
  }

  static async remove(id: number): Promise<WhitelistEmailMutationResult> {
    if (!supabase) {
      return { ok: false, message: 'Supabase client is not available.' }
    }

    try {
      const { error } = await supabase
        .from('whitelist_email_addresses')
        .delete()
        .eq('id', id)

      if (error) {
        return buildFailure('Error removing whitelist email address:', error)
      }

      return { ok: true }
    } catch (error) {
      return buildFailure(
        'Unexpected error removing whitelist email address:',
        error
      )
    }
  }
}
