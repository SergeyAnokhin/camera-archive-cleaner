// Default emoji for all known object labels (Russian COCO names + common Gemini/Claude outputs + English fallback)
export const OBJECT_EMOJI_DEFAULTS = {
  // ── People ──
  'человек':    '👤',
  'люди':       '👥',
  'мужчина':    '🧔',
  'мужик':      '🧔',
  'женщина':    '👩',
  'девушка':    '👩',
  'ребёнок':    '👶',
  'ребенок':    '👶',
  'мальчик':    '👦',
  'девочка':    '👧',
  // ── Vehicles ──
  'машина':     '🚗',
  'автомобиль': '🚗',
  'грузовик':   '🚛',
  'мотоцикл':   '🏍️',
  'велосипед':  '🚲',
  'автобус':    '🚌',
  'самолёт':    '✈️',
  'поезд':      '🚆',
  'лодка':      '🚤',
  // ── Animals ──
  'кошка':      '🐱',
  'кот':        '🐱',
  'собака':     '🐕',
  'пёс':        '🐕',
  'птица':      '🐦',
  'курица':     '🐔',
  'петух':      '🐓',
  'кролик':     '🐇',
  'лиса':       '🦊',
  'белка':      '🐿️',
  'ёж':         '🦔',
  'ежик':       '🦔',
  'конь':       '🐴',
  'лошадь':     '🐴',
  'корова':     '🐄',
  'медведь':    '🐻',
  'овца':       '🐑',
  'слон':       '🐘',
  'зебра':      '🦓',
  'жираф':      '🦒',
  'животное':   '🐾',
  'паук':       '🕷️',
  'паутина':    '🕸️',
  'насекомое':  '🐛',
  // ── Weather ──
  'дождь':      '🌧️',
  'снег':       '❄️',
  // ── Objects / Accessories ──
  'рюкзак':     '🎒',
  'зонт':       '☂️',
  'сумка':      '👜',
  'чемодан':    '🧳',
  'пакет':      '📦',
  'посылка':    '📦',
  // ── English COCO 80-class ──
  'person':         '👤',
  'people':         '👥',
  'man':            '🧔',
  'woman':          '👩',
  'child':          '👶',
  'boy':            '👦',
  'girl':           '👧',
  'bicycle':        '🚲',
  'car':            '🚗',
  'motorcycle':     '🏍️',
  'airplane':       '✈️',
  'bus':            '🚌',
  'train':          '🚆',
  'truck':          '🚛',
  'boat':           '🚤',
  'traffic light':  '🚦',
  'fire hydrant':   '🧯',
  'stop sign':      '🛑',
  'parking meter':  '🅿️',
  'bench':          '🪑',
  'bird':           '🐦',
  'cat':            '🐱',
  'dog':            '🐕',
  'horse':          '🐴',
  'sheep':          '🐑',
  'cow':            '🐄',
  'elephant':       '🐘',
  'bear':           '🐻',
  'zebra':          '🦓',
  'giraffe':        '🦒',
  'backpack':       '🎒',
  'umbrella':       '☂️',
  'handbag':        '👜',
  'tie':            '👔',
  'suitcase':       '🧳',
  'frisbee':        '🥏',
  'skis':           '⛷️',
  'snowboard':      '🏂',
  'sports ball':    '⚽',
  'kite':           '🪁',
  'baseball bat':   '🏏',
  'baseball glove': '⚾',
  'skateboard':     '🛹',
  'surfboard':      '🏄',
  'tennis racket':  '🎾',
  'bottle':         '🍶',
  'wine glass':     '🍷',
  'cup':            '☕',
  'fork':           '🍴',
  'knife':          '🔪',
  'spoon':          '🥄',
  'bowl':           '🥣',
  'banana':         '🍌',
  'apple':          '🍎',
  'sandwich':       '🥪',
  'orange':         '🍊',
  'broccoli':       '🥦',
  'carrot':         '🥕',
  'hot dog':        '🌭',
  'pizza':          '🍕',
  'donut':          '🍩',
  'cake':           '🎂',
  'chair':          '🪑',
  'couch':          '🛋️',
  'potted plant':   '🪴',
  'bed':            '🛏️',
  'dining table':   '🍽️',
  'toilet':         '🚽',
  'tv':             '📺',
  'laptop':         '💻',
  'mouse':          '🖱️',
  'remote':         '📺',
  'keyboard':       '⌨️',
  'cell phone':     '📱',
  'microwave':      '📦',
  'oven':           '🍳',
  'toaster':        '🍞',
  'sink':           '🚿',
  'refrigerator':   '🧊',
  'book':           '📚',
  'clock':          '⏰',
  'vase':           '🏺',
  'scissors':       '✂️',
  'teddy bear':     '🧸',
  'hair drier':     '💨',
  'toothbrush':     '🪥',
  'fox':            '🦊',
  'rabbit':         '🐇',
  'chicken':        '🐔',
  'rain':           '🌧️',
  'snow':           '❄️',
}

function getEmojiMap() {
  try {
    const stored = localStorage.getItem('detection_emoji_overrides')
    return stored ? { ...OBJECT_EMOJI_DEFAULTS, ...JSON.parse(stored) } : OBJECT_EMOJI_DEFAULTS
  } catch { return OBJECT_EMOJI_DEFAULTS }
}

export function getExcludedObjects() {
  try {
    const stored = localStorage.getItem('detection_excluded_objects')
    if (!stored) return new Set()
    return new Set(JSON.parse(stored).map(s => s.toLowerCase().trim()).filter(Boolean))
  } catch { return new Set() }
}

export function resolveAiIcons(objectsStr) {
  if (!objectsStr) return []
  const emojiMap = getEmojiMap()
  const excluded = getExcludedObjects()
  const seen = new Set()
  const result = []
  for (const o of objectsStr.split(/\s+/).filter(Boolean)) {
    const key = o.toLowerCase()
    if (excluded.has(key)) continue
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ emoji: emojiMap[key] || '●', label: o })
    }
  }
  return result
}
