import { useMemo } from 'react'
import { getAiRequestStats } from './hourUtils.js'
import { resolveAiIcons } from '../../aiHelpers.js'
import './AiModePanel.css'

export const AI_PROVIDER_CONFIG = {
  gemini: {
    modelKey: 'gemini_model',
    defaultModel: 'gemini-3.1-flash-lite',
    icon: 'mdi-google',
    label: 'Gemini Analysis',
  },
  claude: {
    modelKey: 'claude_model',
    defaultModel: 'claude-haiku-4-5-20251001',
    icon: 'mdi-robot',
    label: 'Claude Analysis',
  },
  openvino: {
    modelKey: 'openvino_model',
    defaultModel: 'yolov8n',
    icon: 'mdi-chip',
    label: 'OpenVINO Detection',
  },
}

export default function AiModePanel({ provider, files, selectedIds, aiAnalysisMap, onRun, statsKey, params, onParamChange }) {
  const cfg = AI_PROVIDER_CONFIG[provider] ?? AI_PROVIDER_CONFIG.gemini
  const model = localStorage.getItem(cfg.modelKey) || cfg.defaultModel

  const stats = getAiRequestStats(provider)

  const photoFiles = files.filter(f => f.file_type === 'photo')
  const targetCount = selectedIds.size > 0
    ? photoFiles.filter(f => selectedIds.has(f.id)).length
    : photoFiles.length

  const analyzedCount = provider === 'openvino'
    ? photoFiles.filter(f => aiAnalysisMap.get(f.id)?.detection != null).length
    : photoFiles.filter(f => aiAnalysisMap.get(f.id)?.ai != null).length

  const sceneEntry = provider !== 'openvino'
    ? [...aiAnalysisMap.values()].find(e => e.ai)?.ai
    : null

  const pageIcons = useMemo(() => {
    const allWords = []
    for (const entry of aiAnalysisMap.values()) {
      const objects = provider === 'openvino' ? entry.detection?.objects : entry.ai?.objects
      if (objects) allWords.push(...objects.split(/\s+/).filter(Boolean))
    }
    return resolveAiIcons(allWords.join(' '))
  }, [aiAnalysisMap, provider])

  const confidence = params?.confidence ?? 25

  const hasStats = analyzedCount > 0 || stats.lastMinute > 0 || stats.last24h > 0 || pageIcons.length > 0

  return (
    <div className="hv-mode-settings hv-ai-panel">
      {/* Row 1: label · model name (read-only) · run button */}
      <span className="hv-mode-settings-label">
        <i className={`mdi ${cfg.icon}`} /> {cfg.label}
      </span>
      <span className="hv-ai-model-label" title="Изменить модель: Tools → настройки">
        <i className="mdi mdi-cog-outline" style={{ marginRight: 4, opacity: 0.6 }} />
        {model}
      </span>
      <button className="hv-ai-run-btn" onClick={onRun}>
        <i className="mdi mdi-play" />
        {selectedIds.size > 0
          ? `Анализ выбранных (${targetCount})`
          : `Анализ страницы (${photoFiles.length})`
        }
      </button>

      {/* Row 2: confidence display (openvino) + stats/analyzed/emojis */}
      {(provider === 'openvino' || hasStats) && (
        <div className="hv-ai-row2">
          {provider === 'openvino' && (
            <span className="hv-ai-confidence-inline">
              <i className="mdi mdi-tune-variant" />
              <span className="hv-ai-confidence-pct">{confidence}%</span>
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
