import { useState, useEffect, useMemo } from 'react'
import { getAiRequestStats } from './hourUtils.js'
import { resolveAiIcons } from '../../aiHelpers.js'

export const AI_PROVIDER_CONFIG = {
  gemini: {
    modelKey: 'gemini_model',
    defaultModel: 'gemini-3.1-flash-lite',
    models: [
      { value: 'gemini-3.1-flash-lite',    label: '🟢 gemini-3.1-flash-lite ($0.25/$1.50)' },
      { value: 'gemini-2.5-flash-lite',    label: '🟢 gemini-2.5-flash-lite ($0.10/$0.40)' },
      { value: 'gemini-2.5-flash',         label: '🟡 gemini-2.5-flash ($0.30/$2.50)' },
      { value: 'gemini-3.1-flash-preview', label: '🟡 gemini-3.1-flash-preview ($0.50/$3.00)' },
      { value: 'gemini-3.5-flash',         label: '🔴 gemini-3.5-flash ($1.50/$9.00)' },
      { value: 'gemini-2.5-pro',           label: '🔴 gemini-2.5-pro ($1.25/$10.00)' },
      { value: 'gemini-3.1-pro-preview',   label: '🔴 gemini-3.1-pro-preview ($2.00/$12.00)' },
    ],
    icon: 'mdi-google',
    label: 'Gemini Analysis',
  },
  claude: {
    modelKey: 'claude_model',
    defaultModel: 'claude-haiku-4-5-20251001',
    models: [
      { value: 'claude-haiku-4-5-20251001', label: '🟢 claude-haiku-4-5 ($0.80/$4.00)' },
      { value: 'claude-sonnet-4-6',         label: '🟡 claude-sonnet-4-6 ($3.00/$15.00)' },
      { value: 'claude-opus-4-7',           label: '🔴 claude-opus-4-7 ($15.00/$75.00)' },
    ],
    icon: 'mdi-robot',
    label: 'Claude Analysis',
  },
  openvino: {
    modelKey: 'openvino_model',
    defaultModel: 'yolov8n',
    models: [
      { value: 'yolov8n', label: '🟢 YOLOv8n — Nano (быстро, ~1-3 с/фото)' },
      { value: 'yolov8s', label: '🟡 YOLOv8s — Small (точнее, ~2-5 с/фото)' },
      { value: 'yolov8m', label: '🔴 YOLOv8m — Medium (медленно, ~5-10 с/фото)' },
    ],
    icon: 'mdi-chip',
    label: 'OpenVINO Detection',
  },
}

export default function AiModePanel({ provider, files, selectedIds, aiAnalysisMap, onRun, statsKey, params, onParamChange }) {
  const cfg = AI_PROVIDER_CONFIG[provider] ?? AI_PROVIDER_CONFIG.gemini
  const [model, setModel] = useState(() =>
    localStorage.getItem(cfg.modelKey) || cfg.defaultModel
  )

  useEffect(() => {
    setModel(localStorage.getItem(cfg.modelKey) || cfg.defaultModel)
  }, [provider])

  const stats = getAiRequestStats(provider)

  const photoFiles = files.filter(f => f.file_type === 'photo')
  const targetCount = selectedIds.size > 0
    ? photoFiles.filter(f => selectedIds.has(f.id)).length
    : photoFiles.length
  const analyzedCount = photoFiles.filter(f => aiAnalysisMap.has(f.id)).length
  const sceneEntry = [...aiAnalysisMap.values()][0]

  const pageIcons = useMemo(() => {
    const allWords = []
    for (const entry of aiAnalysisMap.values()) {
      if (entry.objects) allWords.push(...entry.objects.split(/\s+/).filter(Boolean))
    }
    return resolveAiIcons(allWords.join(' '))
  }, [aiAnalysisMap])

  function handleModelChange(e) {
    setModel(e.target.value)
    localStorage.setItem(cfg.modelKey, e.target.value)
    onParamChange?.('_refresh', Date.now())
  }

  const confidence = params?.confidence ?? 25

  const hasStats = analyzedCount > 0 || stats.lastMinute > 0 || stats.last24h > 0 || pageIcons.length > 0

  return (
    <div className="hv-mode-settings hv-ai-panel">
      {/* Row 1: label · model select · run button */}
      <span className="hv-mode-settings-label">
        <i className={`mdi ${cfg.icon}`} /> {cfg.label}
      </span>
      <select className="hv-ai-model-select" value={model} onChange={handleModelChange}>
        {cfg.models.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <button className="hv-ai-run-btn" onClick={onRun}>
        <i className="mdi mdi-play" />
        {selectedIds.size > 0
          ? `Анализ выбранных (${targetCount})`
          : `Анализ страницы (${photoFiles.length})`
        }
      </button>

      {/* Row 2: threshold (openvino) + stats/analyzed/emojis */}
      {(provider === 'openvino' || hasStats) && (
        <div className="hv-ai-row2">
          {provider === 'openvino' && (
            <span className="hv-ai-confidence-inline">
              <i className="mdi mdi-tune-variant" />
              <span className="hv-ai-confidence-pct">{confidence}%</span>
              <input
                type="range"
                className="hv-ai-confidence-slider"
                min={10} max={80} step={5}
                value={confidence}
                onChange={e => onParamChange?.('confidence', +e.target.value)}
              />
            </span>
          )}
          {hasStats && (
            <span className="hv-ai-info-group">
              {analyzedCount > 0 && (
                <span className="hv-ai-panel-info">
                  <i className="mdi mdi-check-circle-outline" style={{color:'#86efac'}} />
                  {analyzedCount}/{photoFiles.length}
                </span>
              )}
              {(stats.lastMinute > 0 || stats.last24h > 0) && (
                <span className="hv-ai-stats">
                  <i className="mdi mdi-chart-timeline-variant" />
                  {stats.lastMinute > 0 && <span>{stats.lastMinute}/мин</span>}
                  <span>{stats.last24h}/24ч</span>
                </span>
              )}
              {pageIcons.length > 0 && pageIcons.map((ic, i) => (
                <span key={i} className="hv-ai-page-emoji" title={ic.label}>{ic.emoji}</span>
              ))}
            </span>
          )}
        </div>
      )}

      {sceneEntry?.scene_description && (
        <div className="hv-ai-scene" title={sceneEntry.scene_description}>
          <i className="mdi mdi-image-filter-hdr-outline" />
          {sceneEntry.scene_description.length > 120
            ? sceneEntry.scene_description.slice(0, 120) + '…'
            : sceneEntry.scene_description}
        </div>
      )}
    </div>
  )
}
