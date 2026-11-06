import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('@/utils/supabase/client', () => ({
  supabase: { auth: { getSession } },
}))
import { getJobRequestHeaders } from './job-request-headers'

beforeEach(() => vi.resetAllMocks())

describe('job request authentication', () => {
  it('reads the current browser session on every request, including refreshed tokens', async () => {
    getSession
      .mockResolvedValueOnce({
        data: { session: { access_token: 'first-jwt' } },
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'refreshed-jwt' } },
      })
    expect(await getJobRequestHeaders()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer first-jwt',
    })
    expect((await getJobRequestHeaders()).Authorization).toBe(
      'Bearer refreshed-jwt'
    )
  })

  it('lets the handler return a JSON sign-in error when no browser session exists', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    expect(await getJobRequestHeaders()).toEqual({
      'Content-Type': 'application/json',
    })
  })

  it('stops when the browser session cannot be read', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new Error('expired'),
    })
    await expect(getJobRequestHeaders()).rejects.toThrow(
      'Please sign in again.'
    )
  })
})
