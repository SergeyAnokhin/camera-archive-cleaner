import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const mhiMode = {
  key: 'mhi',
  label: 'MHI trail',
  getImageUrl: (file, { pagePhotoIds, diffThreshold }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, diffThreshold, 'mhi')
      : getThumbnailUrl(file.id),
}

export default mhiMode
