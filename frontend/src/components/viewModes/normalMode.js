import { getThumbnailUrl } from '../../api.js'

const normalMode = {
  key: 'normal',
  label: 'Normal',
  getImageUrl: (file) => getThumbnailUrl(file.id),
}

export default normalMode
