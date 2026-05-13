import { getThumbnailUrl, getErosionThumbnailUrl } from '../../api.js'

const erosionMode = {
  key: 'erosion',
  label: 'Erosion',
  getImageUrl: (file, { pagePhotoIds, diffThreshold }) =>
    pagePhotoIds.length > 0
      ? getErosionThumbnailUrl(file.id, pagePhotoIds, diffThreshold)
      : getThumbnailUrl(file.id),
}

export default erosionMode
