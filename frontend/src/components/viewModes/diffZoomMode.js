import { getThumbnailUrl, getDiffZoomThumbnailUrl } from '../../api.js'

const diffZoomMode = {
  key: 'diff_zoom',
  label: 'Motion diff zoom',
  params: [
    { key: 'threshold', label: 'Sensitivity', min: 0, max: 100, default: 20, step: 1 },
  ],
  getImageUrl: (file, { pagePhotoIds, params }) =>
    pagePhotoIds.length > 0
      ? getDiffZoomThumbnailUrl(file.id, pagePhotoIds, params?.threshold ?? 20)
      : getThumbnailUrl(file.id),
}

export default diffZoomMode
