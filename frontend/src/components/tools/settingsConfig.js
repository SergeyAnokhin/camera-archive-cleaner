// localStorage keys, defaults and option lists for the Tools modal.

import { STRUCTURED_ANALYSIS_TEMPLATE } from '../../prompts.js'

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

export const ETA_WINDOW_KEY     = 'eta_window_minutes'
export const ETA_WINDOW_MIN     = 1
export const ETA_WINDOW_MAX     = 30
export const ETA_WINDOW_DEFAULT = 5

export const VIDEO_PREVIEW_KEY     = 'video_preview_mode'
export const VIDEO_PREVIEW_DEFAULT = 'none'
export const VIDEO_PREVIEW_OPTIONS = [
  { value: 'none',           label: 'None (camera icon)' },
  { value: 'first_frame',    label: 'First frame' },
  { value: 'last_frame',     label: 'Last frame' },
  { value: 'four_frames',      label: '4 frames (2×2 grid)' },
  { value: 'max_change_gif',   label: 'GIF — max change (2 frames)' },
  { value: 'four_frames_gif',  label: 'GIF — 4 frames evenly spaced' },
  { value: 'max_change_4_gif', label: 'GIF — 4 frames with most change' },
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
export const DETECTION_CLASSES_KEY = 'detection_classes'

export const OV_MODEL_KEY     = 'openvino_model'
export const OV_MODEL_DEFAULT = 'yolov8n'
export const OV_MODELS = [
  { value: 'yolov8n', label: 'YOLOv8n — nano (fastest)' },
  { value: 'yolov8s', label: 'YOLOv8s — small' },
  { value: 'yolov8m', label: 'YOLOv8m — medium (more accurate)' },
]

export const UNIFORMITY_METHOD_KEY     = 'uniformity_method'
export const UNIFORMITY_METHOD_DEFAULT = 'combined'

export const U_METRICS = [
  { key: 'af',       label: 'AF', desc: 'Active Fraction — share of active minutes' },
  { key: 'se',       label: 'SE', desc: 'Shannon Entropy — load distribution' },
  { key: 'bc',       label: 'BC', desc: 'Block Coverage — active 5-min blocks' },
  { key: 'combined', label: '∑',  desc: 'Combined score (40AF+35SE+25BC)' },
]
export const U_DEFAULTS = { af: [40, 65], se: [55, 80], bc: [40, 65], combined: [50, 72] }

export const MOTION_MODE_KEYS = [
  'motion_diff', 'erosion',
]

export const BURST_GAP_KEY     = 'burst_gap_seconds'
export const BURST_GAP_DEFAULT = 30
export const BURST_GAP_MIN     = 5
export const BURST_GAP_MAX     = 300

export const LOG_TAIL_KEY     = 'log_tail_lines'
export const LOG_TAIL_DEFAULT = 10
export const LOG_TAIL_MIN     = 5
export const LOG_TAIL_MAX     = 300

// Compute-service routing — local cache of the server-side config.
// Source of truth is the backend (compute_config.json); these keys let the
// frontend read the mode synchronously (e.g. to hide heavy view modes).
export const COMPUTE_MODE_KEY    = 'compute_mode'
export const COMPUTE_URL_KEY     = 'compute_remote_url'
// UI-level mode label — "browser" means auto-detected browser-local, stored separately
// from the backend mode (which is always "remote" for browser-local).
export const COMPUTE_MODE_UI_KEY = 'compute_mode_ui'
