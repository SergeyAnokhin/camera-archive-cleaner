// Single source of truth for all AI prompt templates.
// `{n}` is replaced with the image count at run time.

// Structured analysis — used by Gemini & Claude batch analysis and as the
// editable default in Tools → Google AI. Model must return strict JSON.
export const STRUCTURED_ANALYSIS_TEMPLATE = `Ты анализируешь {n} снимков с камеры видеонаблюдения.

Для каждого снимка:
- description: 1-2 предложения. Опиши ДИНАМИЧЕСКИЕ объекты и их взаимодействие или положение. Если очевидно, что объект что-то делает — укажи, но только при высокой уверенности. Фон и декорации не описывай.
- objects: массив коротких слов для динамических объектов. Используй максимально конкретные слова:
  • Люди: "мужчина", "женщина", "ребёнок", "мальчик", "девочка" — или "человек" если пол/возраст не определить.
  • Животные: "кошка", "собака", "птица", "курица", "кролик", "лиса", "белка", "конь", "корова", "ёж" и т.д. — НЕ пиши просто "животное".
  • Транспорт: "машина", "грузовик", "велосипед", "мотоцикл", "автобус".
  • Прочее: "дождь", "снег", "паук", "пакет".
  Пустой массив [], если динамических объектов нет.

scene: 1 предложение — что в целом происходит на этих {n} снимках (общая активность, не описание места).

Ответь СТРОГО JSON (без markdown, без пояснений):
{"scene": "...", "images": [{"description": "...", "objects": [...]}, ...]}`

// Free-form (non-structured) Gemini prompt — plain-text description, no JSON.
export const GEMINI_FREEFORM_PROMPT = 'Детально опиши, что происходит на этих снимках с камеры видеонаблюдения. Перечисли все заметные объекты, людей, транспортные средства и события.'

// Heatmap CellSelBar batch analysis — compact English prompt for one preview
// photo per selected cell.
export const CELL_ANALYSIS_PROMPT = (n) =>
  `You are analyzing ${n} photos from a security camera. Return ONLY valid JSON:\n{"scene":"one sentence","images":[{"description":"1-2 sentences","objects":["мужчина","кошка"]}]}\nUse Russian words for people and animals (человек, мужчина, женщина, ребёнок, кошка, собака, птица, машина, велосипед, etc.).`
