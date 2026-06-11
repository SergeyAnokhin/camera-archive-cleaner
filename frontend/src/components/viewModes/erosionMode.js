import { getThumbnailUrl, getErosionThumbnailUrl } from '../../api.js'

const erosionMode = {
  key: 'erosion',
  label: 'Motion (noise-filtered)',
  description: 'Background subtraction that ignores rain, cobwebs and insects — good first choice for motion review',
  params: [
    { key: 'threshold', label: 'Sensitivity', min: 0, max: 100, default: 20, step: 1 },
  ],
  getImageUrl: (file, { pagePhotoIds, params }) =>
    pagePhotoIds.length > 0
      ? getErosionThumbnailUrl(file.id, pagePhotoIds, params?.threshold ?? 20)
      : getThumbnailUrl(file.id),
}

export default erosionMode
