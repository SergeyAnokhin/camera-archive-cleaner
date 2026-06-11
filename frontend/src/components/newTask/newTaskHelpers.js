// Helpers and constants for NewTaskModal and its newTask/ panels.

export function toLocalInput(isoStr) {
  return isoStr ? isoStr.slice(0, 16) : ''
}

export function nowLocalInput() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function monthStartInput() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-01T00:00`
}

export function isAiType(type)  { return type === 'gemini' || type === 'claude' }
export function isDbType(type)  { return ['video_thumbnails','openvino','gemini','claude'].includes(type) }

export function readGlobalSettings() {
  const videoMode = localStorage.getItem('video_preview_mode') || 'four_frames'
  const ovModel   = localStorage.getItem('openvino_model') || 'yolov8n'
  const ovConf    = (() => {
    try { return JSON.parse(localStorage.getItem('mode_params_openvino_detection') || '{}').confidence ?? 25 }
    catch { return 25 }
  })()
  const geminiModel = localStorage.getItem('gemini_model') || 'gemini-3.1-flash-lite'
  const claudeModel = localStorage.getItem('claude_model') || 'claude-haiku-4-5-20251001'
  const etaWindowMinutes = Number(localStorage.getItem('eta_window_minutes')) || 5
  return { videoMode, ovModel, ovConf, geminiModel, claudeModel, etaWindowMinutes }
}

export const VIDEO_MODE_LABELS = {
  'none':           'Нет (иконка камеры)',
  'first_frame':    'Первый кадр',
  'last_frame':     'Последний кадр',
  'four_frames':    '4 кадра (2×2)',
  'max_change_gif': 'GIF — 2 кадра (макс. изменение)',
  'four_frames_gif':'GIF — 4 кадра равномерно',
  'max_change_4_gif':'GIF — 4 кадра (макс. изменение)',
}

export const VC_CODECS  = ['libx265', 'libx264', 'libvpx-vp9', 'copy']
export const VC_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'veryslow']

export const TASK_TYPES = [
  { type: 'video_thumbnails', icon: 'mdi-video-outline',         name: 'Video Thumbnails',   desc: 'Превью для видео в диапазоне дат' },
  { type: 'openvino',         icon: 'mdi-magnify-scan',          name: 'OpenVINO Detection', desc: 'YOLO детекция объектов на фото' },
  { type: 'gemini',           icon: 'mdi-google',                name: 'Gemini AI Analysis', desc: 'Анализ фото с Google Gemini' },
  { type: 'claude',           icon: 'mdi-robot',                 name: 'Claude AI Analysis', desc: 'Анализ фото с Anthropic Claude' },
  { type: 'video_convert',    icon: 'mdi-video-check',           name: 'Video Convert',      desc: 'Конвертация видео через ffmpeg (H.265)' },
  { type: 'file_organizer',   icon: 'mdi-folder-move-outline',   name: 'File Organizer',     desc: 'Раскладывание файлов по ГГГГ/ММ/ДД' },
]
