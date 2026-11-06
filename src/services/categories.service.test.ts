import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  in: vi.fn(),
  range: vi.fn(),
}))
vi.mock('@/utils/supabase/client', () => ({ supabase: { from: mocks.from } }))
import { CategoriesService } from './categories.service'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.from.mockReturnValue(mocks)
  mocks.select.mockReturnValue(mocks)
  mocks.order.mockReturnValue(mocks)
  mocks.in.mockReturnValue(mocks)
  mocks.range.mockResolvedValue({ data: [], error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('scoped image category mappings', () => {
  it('makes no database request for an empty picker and bounds UUID filter size', async () => {
    expect(await CategoriesService.getImageCategoryMap([])).toEqual(new Map())
    expect(mocks.from).not.toHaveBeenCalled()
    const ids = Array.from({ length: 201 }, (_, id) => `image-${id}`)
    await CategoriesService.getImageCategoryMap([...ids, ids[0]])
    expect(mocks.in.mock.calls).toEqual([
      ['image_id', ids.slice(0, 100)],
      ['image_id', ids.slice(100, 200)],
      ['image_id', ids.slice(200)],
    ])
  })

  it('retains category links beyond the row limit with a stable order and the image filter on every page', async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({
      image_id: 'image',
      common_use_category_id: id,
    }))
    mocks.range.mockImplementation(async (start: number, end: number) => ({
      data: rows.slice(start, end + 1),
      error: null,
    }))
    expect(
      (await CategoriesService.getImageCategoryMap(['image'])).get('image')
    ).toEqual(rows.map((row) => row.common_use_category_id))
    expect(mocks.in.mock.calls).toEqual([
      ['image_id', ['image']],
      ['image_id', ['image']],
    ])
    expect(mocks.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(mocks.order.mock.calls).toEqual([
      ['image_id'],
      ['common_use_category_id'],
      ['image_id'],
      ['common_use_category_id'],
    ])
  })

  it('does not silently drop categories when a scoped query fails', async () => {
    mocks.range.mockResolvedValue({ data: null, error: { message: 'Offline' } })
    await expect(
      CategoriesService.getImageCategoryMap(['image'])
    ).rejects.toThrow('Offline')
  })
})
