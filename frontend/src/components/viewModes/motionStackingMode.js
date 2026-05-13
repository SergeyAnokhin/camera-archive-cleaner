import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const motionStackingMode = {
  key: 'motion_stacking',
  label: 'Motion stacking',
  getImageUrl: (file, { pagePhotoIds, diffThreshold }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, diffThreshold, 'motion_stacking')
      : getThumbnailUrl(file.id),
}

export default motionStackingMode
