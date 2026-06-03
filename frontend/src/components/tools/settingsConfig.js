// localStorage keys, defaults and option lists for the Tools modal.

import { STRUCTURED_ANALYSIS_TEMPLATE, OLLAMA_SINGLE_IMAGE_TEMPLATE } from '../../prompts.js'

export const FONT_KEY = 'font-base'
export const FONT_MIN = 12
export const FONT_MAX = 22
export const FONT_DEFAULT = 15

export const PREVIEWS_PER_CELL_KEY = 'previews_per_cell'
export const PREVIEWS_PER_CELL_MIN = 0
export const PREVIEWS_PER_CELL_MAX = 10
export const PREVIEWS_PER_CELL_DEFAULT = 3

export const PAGE_SIZE_KEY = 'hour_page_size'
export const PAGE_SIZE_MIN = 10
export const PAGE_SIZE_MAX = 200
export const PAGE_SIZE_DEFAULT = 50

export const ZOOM_KEY = 'hover_zoom'
export const ZOOM_MIN = 1.0
export const ZOOM_MAX = 3.0
export const ZOOM_STEP = 0.25
export const ZOOM_DEFAULT = 1.5

export const THUMB_WIDTH_KEY     = 'thumb_width'
export const THUMB_WIDTH_MIN     = 80
export const THUMB_WIDTH_MAX     = 400
export const THUMB_WIDTH_DEFAULT = 140

export const DIFF_THRESHOLD_KEY     = 'diff_threshold'
export const DIFF_THRESHOLD_MIN     = 0
export const DIFF_THRESHOLD_MAX     = 100
export const DIFF_THRESHOLD_DEFAULT = 20

export const VIDEO_PREVIEW_KEY     = 'video_preview_mode'
export const VIDEO_PREVIEW_DEFAULT = 'none'
export const VIDEO_PREVIEW_OPTIONS = [
  { value: 'none',           label: 'Нет (иконка камеры)' },
  { value: 'first_frame',    label: 'Первый кадр' },
  { value: 'last_frame',     label: 'Последний кадр' },
  { value: 'four_frames',    label: '4 кадра (2×2 сетка)' },
  { value: 'max_change_gif', label: 'GIF — максимальное изменение' },
]

export const GEMINI_API_KEY_KEY = 'gemini_api_key'
export const GEMINI_MODEL_KEY   = 'gemini_model'
export const GEMINI_PROMPT_KEY  = 'gemini_structured_prompt'
export const GEMINI_DEFAULT_MODEL  = 'gemini-3.1-flash-lite'
export const GEMINI_DEFAULT_PROMPT = STRUCTURED_ANALYSIS_TEMPLATE

export const CLAUDE_API_KEY_KEY   = 'claude_api_key'
export const CLAUDE_MODEL_KEY     = 'claude_model'
export const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export const CLAUDE_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5',   tier: '🟢 lite' },
  { value: 'claude-sonnet-4-6',         label: 'claude-sonnet-4-6',  tier: '🟡 base' },
  { value: 'claude-opus-4-7',           label: 'claude-opus-4-7',    tier: '🔴 pro'  },
]

export const CLAUDE_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':           { input: 15.00, output: 75.00 },
}

export const OLLAMA_BASE_URL_KEY   = 'ollama_base_url'
export const OLLAMA_MODEL_KEY      = 'ollama_model'
export const OLLAMA_PROMPT_KEY     = 'ollama_single_image_prompt'
export const OLLAMA_DEFAULT_URL    = 'http://localhost:11434'
export const OLLAMA_DEFAULT_MODEL  = 'gemma3:4b'
export const OLLAMA_DEFAULT_PROMPT = OLLAMA_SINGLE_IMAGE_TEMPLATE

export const GEMINI_MODELS = [
  { value: 'gemini-3.1-flash-lite',    label: 'gemini-3.1-flash-lite',    tier: '🟢 lite' },
  { value: 'gemini-2.5-flash-lite',    label: 'gemini-2.5-flash-lite',    tier: '🟢 lite' },
  { value: 'gemini-2.5-flash',         label: 'gemini-2.5-flash',         tier: '🟡 base' },
  { value: 'gemini-3.1-flash-preview', label: 'gemini-3.1-flash-preview', tier: '🟡 base' },
  { value: 'gemini-3.5-flash',         label: 'gemini-3.5-flash',         tier: '🔴 pro'  },
  { value: 'gemini-2.5-pro',           label: 'gemini-2.5-pro',           tier: '🔴 pro'  },
  { value: 'gemini-3.1-pro-preview',   label: 'gemini-3.1-pro-preview',   tier: '🔴 pro'  },
]

export const GEMINI_PRICING = {
  'gemini-3.1-flash-lite':    { input: 0.25,  output: 1.50  },
  'gemini-2.5-flash-lite':    { input: 0.10,  output: 0.40  },
  'gemini-2.5-flash':         { input: 0.30,  output: 2.50  },
  'gemini-3.1-flash-preview': { input: 0.50,  output: 3.00  },
  'gemini-3.5-flash':         { input: 1.50,  output: 9.00  },
  'gemini-2.5-pro':           { input: 1.25,  output: 10.00 },
  'gemini-3.1-pro-preview':   { input: 2.00,  output: 12.00 },
}

export const OV_CONFIDENCE_KEY = 'mode_params_openvino_detection'
export const OV_CONFIDENCE_DEFAULT = 25
export const EXCLUDED_OBJECTS_KEY = 'detection_excluded_objects'
export const EMOJI_OVERRIDES_KEY  = 'detection_emoji_overrides'

export const UNIFORMITY_METHOD_KEY     = 'uniformity_method'
export const UNIFORMITY_METHOD_DEFAULT = 'combined'

export const U_METRICS = [
  { key: 'af',       label: 'AF', desc: 'Active Fraction — доля активных минут' },
  { key: 'se',       label: 'SE', desc: 'Shannon Entropy — равномерность нагрузки' },
  { key: 'bc',       label: 'BC', desc: 'Block Coverage — активные блоки 5 мин' },
  { key: 'combined', label: '∑',  desc: 'Комбинированный (40AF+35SE+25BC)' },
]
export const U_DEFAULTS = { af: [40, 65], se: [55, 80], bc: [40, 65], combined: [50, 72] }

export const MOTION_MODE_KEYS = [
  'motion_diff', 'diff_zoom', 'erosion', 'neon_mask', 'mhi', 'bounding_boxes', 'motion_stacking'
]

// Compute-service routing — local cache of the server-side config.
// Source of truth is the backend (compute_config.json); these keys let the
// frontend read the mode synchronously (e.g. to hide heavy view modes).
export const COMPUTE_MODE_KEY = 'compute_mode'
export const COMPUTE_URL_KEY  = 'compute_remote_url'
