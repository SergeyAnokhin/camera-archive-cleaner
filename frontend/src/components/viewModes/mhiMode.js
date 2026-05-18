import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const mhiMode = {
  key: 'mhi',
  label: 'MHI trail',
  params: [
    { key: 'threshold', label: 'Sensitivity', min: 0, max: 100, default: 20, step: 1 },
  ],
  getImageUrl: (file, { pagePhotoIds, params }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, params?.threshold ?? 20, 'mhi')
      : getThumbnailUrl(file.id),
}

export default mhiMode
