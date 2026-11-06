import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/actions', () => ({ getAuthTokenAction: vi.fn() }))
import { getAuthTokenAction } from '@/app/actions'
import {
  buildCaptionArrayGroups,
  requestCaptionArrayDedupe,
  validateCaptionArrayGroups,
} from './caption-array-dedupe.service'

const a = '00000000-0000-4000-8000-000000000001'
const b = '00000000-0000-4000-8000-000000000002'
const c = '00000000-0000-4000-8000-000000000003'
const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getAuthTokenAction).mockResolvedValue({
    access_token: 'user-jwt',
  } as Awaited<ReturnType<typeof getAuthTokenAction>>)
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ Other: [a, b] }),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('caption-array review', () => {
  it('posts a raw UUID array with the current JWT, never a study ID or naming request', async () => {
    expect(await requestCaptionArrayDedupe([a, b, a])).toEqual({
      Other: [a, b],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/pipeline\/deduplicate-caption-array$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify([a, b]),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer user-jwt',
        },
      })
    )
  })
  it('accepts one caption and normalizes UUIDs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Other: [a] }),
    })
    expect(await requestCaptionArrayDedupe([` ${a.toUpperCase()} `])).toEqual({
      Other: [a],
    })
  })
  it('does not fall back to creating a study when staging fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Pipeline unavailable' }),
    })
    await expect(requestCaptionArrayDedupe([a, b])).rejects.toThrow(
      'Pipeline unavailable'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects missing authentication before sending captions', async () => {
    vi.mocked(getAuthTokenAction).mockResolvedValue({
      access_token: '',
    } as Awaited<ReturnType<typeof getAuthTokenAction>>)
    await expect(requestCaptionArrayDedupe([a])).rejects.toThrow(
      'Authentication required'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each(
    [
      [],
      ['raw caption text'],
      Array.from(
        { length: 501 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      ),
    ].map((ids) => [ids])
  )('rejects invalid or oversized requests without batching', async (ids) => {
    await expect(requestCaptionArrayDedupe(ids)).rejects.toThrow(
      'saved caption IDs'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('cancels a request when its caller aborts', async () => {
    const caller = new AbortController()
    fetchMock.mockImplementation(
      (_url, { signal }: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        })
    )
    const promise = requestCaptionArrayDedupe([a], caller.signal)
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    caller.abort()
    await assertion
  })
  it('does not issue a request after cancellation during authentication', async () => {
    const caller = new AbortController()
    vi.mocked(getAuthTokenAction).mockImplementation(async () => {
      caller.abort()
      return { access_token: 'user-jwt' } as Awaited<
        ReturnType<typeof getAuthTokenAction>
      >
    })
    await expect(
      requestCaptionArrayDedupe([a], caller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('ignores a late successful response after cancellation', async () => {
    const caller = new AbortController()
    fetchMock.mockImplementation(async () => {
      caller.abort()
      return { ok: true, json: async () => ({ Other: [a] }) }
    })
    await expect(
      requestCaptionArrayDedupe([a], caller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('times out at 120 seconds', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url, { signal }: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        })
    )
    const assertion = expect(
      requestCaptionArrayDedupe([a])
    ).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('caption-array response validation', () => {
  it.each(
    [
      null,
      [],
      'invalid',
      {},
      { Empty: [] },
      { Group: a },
      { '': [a, b] },
      { Group: [a] },
      { Group: [a, b, c] },
      { Group: [a, a, b] },
      { Group: [a], Other: [a, b] },
      { Group: [a, 42] },
    ].map((body) => [body])
  )(
    'rejects malformed, missing, unknown, or duplicate captions: %j',
    (body) => {
      expect(() => validateCaptionArrayGroups(body, [a, b])).toThrow()
    }
  )
  it('preserves API names and numeric suffixes, and puts unboxed Other last', () => {
    const result = validateCaptionArrayGroups(
      { Other: [c], 'Library Panic': [a], 'Library Panic (2)': [b] },
      [a, b, c]
    )
    const items = [a, b, c].map((id) => ({
      id,
      caption: `Caption ${id}`,
      imageId: 'image',
      imageUrl: 'url',
    }))
    const groups = buildCaptionArrayGroups(result, items)
    expect(groups.map((group) => [group.name, group.isOutliers])).toEqual([
      ['Library Panic', false],
      ['Library Panic (2)', false],
      ['Other', true],
    ])
    expect(groups[0].captions[0]).toBe(items[0])
  })
})
