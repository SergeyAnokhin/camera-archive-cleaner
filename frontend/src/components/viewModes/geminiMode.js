import { getThumbnailUrl } from '../../api.js'

export default {
  key: 'gemini_analysis',
  label: 'AI description (Gemini)',
  description: 'Cloud AI: per-photo description and detected objects — requires a Google AI API key',
  params: [],
  isAiMode: true,
  aiProvider: 'gemini',
  getImageUrl(file) {
    return getThumbnailUrl(file.id)
  },
}
