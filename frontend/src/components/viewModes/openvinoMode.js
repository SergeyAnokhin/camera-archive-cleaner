import { getThumbnailUrl } from '../../api.js'

export default {
  key: 'openvino_detection',
  label: 'OpenVINO Detection',
  params: [],
  isAiMode: true,
  aiProvider: 'openvino',
  getImageUrl(file) {
    return getThumbnailUrl(file.id)
  },
}
