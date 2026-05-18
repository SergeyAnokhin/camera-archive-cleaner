import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const neonMaskMode = {
  key: 'neon_mask',
  label: 'Neon mask',
  params: [
    { key: 'threshold', label: 'Sensitivity', min: 0, max: 100, default: 20, step: 1 },
  ],
  getImageUrl: (file, { pagePhotoIds, params }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, params?.threshold ?? 20, 'neon_mask')
      : getThumbnailUrl(file.id),
}

export default neonMaskMode
