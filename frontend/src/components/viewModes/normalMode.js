import { getThumbnailUrl } from '../../api.js'

const normalMode = {
  key: 'normal',
  label: 'Normal',
  description: 'Original snapshot thumbnails, no processing',
  getImageUrl: (file) => getThumbnailUrl(file.id),
}

export default normalMode
