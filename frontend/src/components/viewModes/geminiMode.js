import { getThumbnailUrl } from '../../api.js'

export default {
  key: 'gemini_analysis',
  label: 'Gemini Analysis',
  params: [],
  isAiMode: true,
  getImageUrl(file) {
    return getThumbnailUrl(file.id)
  },
}
