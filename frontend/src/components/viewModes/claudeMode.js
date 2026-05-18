import { getThumbnailUrl } from '../../api.js'

export default {
  key: 'claude_analysis',
  label: 'Claude Analysis',
  params: [],
  isAiMode: true,
  aiProvider: 'claude',
  getImageUrl(file) {
    return getThumbnailUrl(file.id)
  },
}
