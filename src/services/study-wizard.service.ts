import { StudiesService, StudyImageSetsService } from './studies.service'
import { ImageService } from './images.service'
import { HumorFlavorsService } from './humor-flavors.service'
import { CategoriesService } from './categories.service'

export const StudyWizardService = {
  async loadInitialData() {
    const [studies, flavors, imageSets] = await Promise.all([
      StudiesService.getAllStudies(),
      HumorFlavorsService.getAll(),
      StudyImageSetsService.getAllImageSetsWithCounts(),
    ])
    return { studies, flavors, imageSets }
  },

  async loadImageLibrary() {
    const imagesPromise = ImageService.getRecentImagesForPicker()
    const categoriesPromise = CategoriesService.getAllCategories()
    const categoryMapPromise = imagesPromise.then((images) =>
      CategoriesService.getImageCategoryMap(images.map((image) => image.id))
    )
    const [images, categories, imageCategoryMap] = await Promise.all([
      imagesPromise,
      categoriesPromise,
      categoryMapPromise,
    ])
    return { images, categories, imageCategoryMap }
  },
}

export type StudyWizardImageLibrary = Awaited<
  ReturnType<typeof StudyWizardService.loadImageLibrary>
>
