import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const neonMaskMode = {
  key: 'neon_mask',
  label: 'Neon mask',
  getImageUrl: (file, { pagePhotoIds, diffThreshold }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, diffThreshold, 'neon_mask')
      : getThumbnailUrl(file.id),
}

export default neonMaskMode
