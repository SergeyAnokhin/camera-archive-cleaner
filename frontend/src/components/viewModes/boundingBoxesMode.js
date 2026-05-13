import { getThumbnailUrl, getMotionThumbnailUrl } from '../../api.js'

const boundingBoxesMode = {
  key: 'bounding_boxes',
  label: 'Bounding boxes',
  getImageUrl: (file, { pagePhotoIds, diffThreshold }) =>
    pagePhotoIds.length > 0
      ? getMotionThumbnailUrl(file.id, pagePhotoIds, diffThreshold, 'bounding_boxes')
      : getThumbnailUrl(file.id),
}

export default boundingBoxesMode
