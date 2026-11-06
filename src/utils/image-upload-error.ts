export function getImageUploadHttpError(status: number): string {
  if (status === 504) {
    return 'The image upload timed out (HTTP 504). Try a smaller image or a different image URL.'
  }
  return `Could not upload the image (HTTP ${status}). Please try again.`
}
