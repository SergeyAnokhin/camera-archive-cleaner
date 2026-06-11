import { getThumbnailUrl } from '../../api.js'

export default {
  key: 'claude_analysis',
  label: 'AI description (Claude)',
  description: 'Cloud AI: per-photo description and detected objects — requires an Anthropic API key',
  params: [],
  isAiMode: true,
  aiProvider: 'claude',
  getImageUrl(file) {
    return getThumbnailUrl(file.id)
  },
}
