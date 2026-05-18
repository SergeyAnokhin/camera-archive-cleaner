import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const boundingBoxesMode = {
  key: 'bounding_boxes',
  label: 'Bounding boxes',
  params: [
    { key: 'threshold', label: 'Sensitivity', min: 0, max: 100, default: 20, step: 1 },
  ],
  getImageUrl: (file, { pagePhotoIds, params }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, params?.threshold ?? 20, 'bounding_boxes')
      : getThumbnailUrl(file.id),
}

export default boundingBoxesMode
