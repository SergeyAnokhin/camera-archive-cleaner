import { getThumbnailUrl, getDiffThumbnailUrl } from '../../api.js'

const motionDiffMode = {
  key: 'motion_diff',
  label: 'Motion diff',
  getImageUrl: (file, { pagePhotoIds, diffThreshold }) =>
    pagePhotoIds.length > 0
      ? getDiffThumbnailUrl(file.id, pagePhotoIds, diffThreshold)
      : getThumbnailUrl(file.id),
}

export default motionDiffMode
