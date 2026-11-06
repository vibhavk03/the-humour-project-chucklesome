import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  studies: vi.fn(),
  flavors: vi.fn(),
  sets: vi.fn(),
  images: vi.fn(),
  categories: vi.fn(),
  categoryMap: vi.fn(),
}))
vi.mock('./studies.service', () => ({
  StudiesService: { getAllStudies: mocks.studies },
  StudyImageSetsService: { getAllImageSetsWithCounts: mocks.sets },
}))
vi.mock('./humor-flavors.service', () => ({
  HumorFlavorsService: { getAll: mocks.flavors },
}))
vi.mock('./images.service', () => ({
  ImageService: { getRecentImagesForPicker: mocks.images },
}))
vi.mock('./categories.service', () => ({
  CategoriesService: {
    getAllCategories: mocks.categories,
    getImageCategoryMap: mocks.categoryMap,
  },
}))

import { StudyWizardService } from './study-wizard.service'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.studies.mockResolvedValue([{ id: 1, slug: 'study' }])
  mocks.flavors.mockResolvedValue([{ id: 1, slug: 'flavor' }])
  mocks.sets.mockResolvedValue([{ id: 1, slug: 'set', imageCount: 2 }])
  mocks.categories.mockResolvedValue([{ id: 4, name: 'category' }])
  mocks.categoryMap.mockResolvedValue(new Map([['image', [4]]]))
})

describe('wizard data loading', () => {
  it('does not wait for or request image-library data before the initial wizard is usable', async () => {
    mocks.images.mockReturnValue(new Promise(() => {}))
    expect(await StudyWizardService.loadInitialData()).toEqual({
      studies: [{ id: 1, slug: 'study' }],
      flavors: [{ id: 1, slug: 'flavor' }],
      imageSets: [{ id: 1, slug: 'set', imageCount: 2 }],
    })
    expect(mocks.images).not.toHaveBeenCalled()
    expect(mocks.categories).not.toHaveBeenCalled()
    expect(mocks.categoryMap).not.toHaveBeenCalled()
  })

  it('starts independent library reads together and scopes category mappings to the returned images', async () => {
    let resolveImages!: (images: Array<{ id: string }>) => void
    mocks.images.mockReturnValue(
      new Promise((resolve) => {
        resolveImages = resolve
      })
    )
    const pending = StudyWizardService.loadImageLibrary()
    expect(mocks.images).toHaveBeenCalledOnce()
    expect(mocks.categories).toHaveBeenCalledOnce()
    expect(mocks.categoryMap).not.toHaveBeenCalled()
    resolveImages([{ id: 'image' }, { id: 'other' }])
    expect((await pending).images).toEqual([{ id: 'image' }, { id: 'other' }])
    expect(mocks.categoryMap).toHaveBeenCalledWith(['image', 'other'])
  })

  it('propagates an image-library failure so the picker can retry instead of showing a false empty result', async () => {
    mocks.images.mockRejectedValueOnce(new Error('Offline'))
    await expect(StudyWizardService.loadImageLibrary()).rejects.toThrow(
      'Offline'
    )
    mocks.images.mockResolvedValueOnce([{ id: 'image' }])
    expect((await StudyWizardService.loadImageLibrary()).images).toEqual([
      { id: 'image' },
    ])
  })
})
