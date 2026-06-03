import { getThumbnailUrl } from '../../api.js'

export default {
  key: 'ollama_analysis',
  label: 'Ollama (локально)',
  params: [],
  isAiMode: true,
  aiProvider: 'ollama',
  getImageUrl(file) {
    return getThumbnailUrl(file.id)
  },
}
