export const AI_ICON_MAP = {
  // --- People ---
  'человек':   { mdi: 'mdi-account',        color: '#60a5fa' },
  'люди':      { mdi: 'mdi-account-multiple',color: '#60a5fa' },
  'мужчина':   { mdi: 'mdi-human-male',      color: '#60a5fa' },
  'мужик':     { mdi: 'mdi-human-male',      color: '#60a5fa' },
  'женщина':   { mdi: 'mdi-human-female',    color: '#f9a8d4' },
  'девушка':   { mdi: 'mdi-human-female',    color: '#f9a8d4' },
  'ребёнок':   { mdi: 'mdi-human-child',     color: '#a5f3fc' },
  'ребенок':   { mdi: 'mdi-human-child',     color: '#a5f3fc' },
  'мальчик':   { mdi: 'mdi-human-child',     color: '#60a5fa' },
  'девочка':   { mdi: 'mdi-human-child',     color: '#f9a8d4' },
  // --- Vehicles ---
  'машина':    { mdi: 'mdi-car',             color: '#fbbf24' },
  'автомобиль':{ mdi: 'mdi-car',             color: '#fbbf24' },
  'грузовик':  { mdi: 'mdi-truck',           color: '#fbbf24' },
  'мотоцикл':  { mdi: 'mdi-motorbike',       color: '#fbbf24' },
  'велосипед': { mdi: 'mdi-bicycle',         color: '#fbbf24' },
  'автобус':   { mdi: 'mdi-bus',             color: '#fbbf24' },
  // --- Animals ---
  'кошка':     { mdi: 'mdi-cat',             color: '#c084fc' },
  'кот':       { mdi: 'mdi-cat',             color: '#c084fc' },
  'собака':    { mdi: 'mdi-dog',             color: '#c084fc' },
  'пёс':       { mdi: 'mdi-dog',             color: '#c084fc' },
  'птица':     { mdi: 'mdi-bird',            color: '#34d399' },
  'курица':    { mdi: 'mdi-bird',            color: '#fbbf24' },
  'петух':     { mdi: 'mdi-bird',            color: '#fbbf24' },
  'кролик':    { mdi: 'mdi-rabbit',          color: '#c084fc' },
  'лиса':      { mdi: 'mdi-fox',             color: '#fb923c' },
  'белка':     { mdi: 'mdi-paw',             color: '#fb923c' },
  'ёж':        { mdi: 'mdi-paw',             color: '#a3e635' },
  'ежик':      { mdi: 'mdi-paw',             color: '#a3e635' },
  'конь':      { mdi: 'mdi-horse',           color: '#d4b483' },
  'лошадь':    { mdi: 'mdi-horse',           color: '#d4b483' },
  'корова':    { mdi: 'mdi-cow',             color: '#d4b483' },
  'медведь':   { mdi: 'mdi-paw',             color: '#fb923c' },
  'животное':  { mdi: 'mdi-paw',             color: '#fb923c' },
  'паук':      { mdi: 'mdi-spider',          color: '#f87171' },
  'паутина':   { mdi: 'mdi-spider',          color: '#f87171' },
  'насекомое': { mdi: 'mdi-bug',             color: '#f87171' },
  // --- Weather ---
  'дождь':     { mdi: 'mdi-weather-rainy',   color: '#93c5fd' },
  'снег':      { mdi: 'mdi-weather-snowy',   color: '#bfdbfe' },
  // --- Objects ---
  'пакет':     { mdi: 'mdi-package-variant', color: '#fb923c' },
  'посылка':   { mdi: 'mdi-package-variant', color: '#fb923c' },
  // --- English ---
  'person':    { mdi: 'mdi-account',         color: '#60a5fa' },
  'people':    { mdi: 'mdi-account-multiple',color: '#60a5fa' },
  'man':       { mdi: 'mdi-human-male',      color: '#60a5fa' },
  'woman':     { mdi: 'mdi-human-female',    color: '#f9a8d4' },
  'child':     { mdi: 'mdi-human-child',     color: '#a5f3fc' },
  'boy':       { mdi: 'mdi-human-child',     color: '#60a5fa' },
  'girl':      { mdi: 'mdi-human-child',     color: '#f9a8d4' },
  'car':       { mdi: 'mdi-car',             color: '#fbbf24' },
  'truck':     { mdi: 'mdi-truck',           color: '#fbbf24' },
  'motorcycle':{ mdi: 'mdi-motorbike',       color: '#fbbf24' },
  'bicycle':   { mdi: 'mdi-bicycle',         color: '#fbbf24' },
  'cat':       { mdi: 'mdi-cat',             color: '#c084fc' },
  'dog':       { mdi: 'mdi-dog',             color: '#c084fc' },
  'bird':      { mdi: 'mdi-bird',            color: '#34d399' },
  'chicken':   { mdi: 'mdi-bird',            color: '#fbbf24' },
  'rabbit':    { mdi: 'mdi-rabbit',          color: '#c084fc' },
  'fox':       { mdi: 'mdi-fox',             color: '#fb923c' },
  'horse':     { mdi: 'mdi-horse',           color: '#d4b483' },
  'cow':       { mdi: 'mdi-cow',             color: '#d4b483' },
  'spider':    { mdi: 'mdi-spider',          color: '#f87171' },
  'rain':      { mdi: 'mdi-weather-rainy',   color: '#93c5fd' },
  'snow':      { mdi: 'mdi-weather-snowy',   color: '#bfdbfe' },
}

export function resolveAiIcons(objectsStr) {
  if (!objectsStr) return []
  const seen = new Set()
  const result = []
  for (const o of objectsStr.split(/\s+/).filter(Boolean)) {
    const key = o.toLowerCase()
    const ic = AI_ICON_MAP[key] || { mdi: 'mdi-circle-small', color: '#94a3b8', label: o }
    // Deduplicate by mdi class so same icon doesn't repeat in one cell
    if (!seen.has(ic.mdi)) {
      seen.add(ic.mdi)
      result.push({ ...ic, label: o })
    }
  }
  return result
}
