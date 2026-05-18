import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const motionStackingMode = {
  key: 'motion_stacking',
  label: 'Motion stacking',
  params: [
    { key: 'threshold', label: 'Sensitivity', min: 0, max: 100, default: 20, step: 1 },
  ],
  getImageUrl: (file, { pagePhotoIds, params }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, params?.threshold ?? 20, 'motion_stacking')
      : getThumbnailUrl(file.id),
}

export default motionStackingMode
