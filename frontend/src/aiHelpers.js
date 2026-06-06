import { COCO_CLASSES } from './cocoClasses.js'

// Build emoji lookup from the authoritative 80-class COCO list (both en and ru keys).
const _cocoEmojiMap = {}
for (const c of COCO_CLASSES) {
  _cocoEmojiMap[c.en.toLowerCase()] = c.emoji
  _cocoEmojiMap[c.ru.toLowerCase()] = c.emoji
}

export function resolveAiIcons(objectsStr) {
  if (!objectsStr) return []
  const seen = new Set()
  const result = []
  for (const o of objectsStr.split(/\s+/).filter(Boolean)) {
    const key = o.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ emoji: _cocoEmojiMap[key] || '●', label: o })
    }
  }
  return result
}
