import { getThumbnailUrl, getDiffZoomThumbnailUrl } from '../../api.js'

const diffZoomMode = {
  key: 'diff_zoom',
  label: 'Motion diff zoom',
  getImageUrl: (file, { pagePhotoIds, diffThreshold }) =>
    pagePhotoIds.length > 0
      ? getDiffZoomThumbnailUrl(file.id, pagePhotoIds, diffThreshold)
      : getThumbnailUrl(file.id),
}

export default diffZoomMode
