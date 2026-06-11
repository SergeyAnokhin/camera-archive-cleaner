import { getThumbnailUrl, getDiffThumbnailUrl } from '../../api.js'

const motionDiffMode = {
  key: 'motion_diff',
  label: 'Motion highlight',
  description: 'Brightens pixels that differ from the hourly average — best for spotting changes in a static scene',
  params: [
    { key: 'threshold', label: 'Sensitivity', min: 0, max: 100, default: 20, step: 1 },
  ],
  getImageUrl: (file, { pagePhotoIds, params }) =>
    pagePhotoIds.length > 0
      ? getDiffThumbnailUrl(file.id, pagePhotoIds, params?.threshold ?? 20)
      : getThumbnailUrl(file.id),
}

export default motionDiffMode
