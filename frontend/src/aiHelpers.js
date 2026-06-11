import { COCO_CLASSES } from './cocoClasses.js'

// Build emoji + display-label lookup from the authoritative 80-class COCO list.
// Both en and ru keys resolve to the same entry so old (RU) and new (EN) DB data
// are handled identically.
const _cocoLookup = {}
for (const c of COCO_CLASSES) {
  const entry = { emoji: c.emoji, label: c.ru }
  _cocoLookup[c.en.toLowerCase()] = entry
  _cocoLookup[c.ru.toLowerCase()] = entry
}

export function resolveAiIcons(objectsStr) {
  if (!objectsStr) return []
  const seen = new Set()
  const result = []
  for (const o of objectsStr.split(/\s+/).filter(Boolean)) {
    const key = o.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      const entry = _cocoLookup[key]
      result.push({ emoji: entry?.emoji || '●', label: entry?.label || o })
    }
  }
  return result
}
