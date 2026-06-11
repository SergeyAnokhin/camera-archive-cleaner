import { useState, useEffect } from 'react'
import {
  deleteByRange, getPreviews, openvinoAnalyzeRange, geminiAnalyzeBatch,
  claudeAnalyzeBatch, getClassesList, createTask,
} from '../api.js'
import { dateRangeForPeriod } from './navUtils.js'
import { CELL_ANALYSIS_PROMPT } from '../prompts.js'

// Heatmap cell-selection state + actions: bulk delete (hour level), batch AI
// analysis and "send to task queue" across selected day/hour cells.
// Used by App.jsx; rendered through CellSelBar.
export function useCellSelection({ cameraId, drillStack, currentLevel, onFilesDeleted }) {
  const [selMode, setSelMode]                 = useState(false)
  const [selectedPeriods, setSelectedPeriods] = useState(new Map())
  const [delLoading, setDelLoading]           = useState(false)
  const [delError, setDelError]               = useState(null)
  const [delConfirm, setDelConfirm]           = useState(false)
  const [aiRefreshKey, setAiRefreshKey]       = useState(0)
  const [analyzing, setAnalyzing]             = useState(false)
  const [analyzeError, setAnalyzeError]       = useState(null)
  const [analyzeProgress, setAnalyzeProgress] = useState('')
  const [taskSent, setTaskSent]               = useState(false)
  const [taskError, setTaskError]             = useState(null)

  // Reset selection state on navigation
  useEffect(() => {
    setSelMode(false)
    setSelectedPeriods(new Map())
    setDelError(null)
    setDelConfirm(false)
    setAnalyzeError(null)
    setTaskSent(false)
    setTaskError(null)
  }, [drillStack, cameraId])

  function closeSelection() {
    setSelMode(false)
    setDelConfirm(false)
    setSelectedPeriods(new Map())
    setAnalyzeError(null)
    setTaskSent(false)
    setTaskError(null)
  }

  function handleTogglePeriod(cell) {
    setSelectedPeriods(prev => {
      const next = new Map(prev)
      next.has(cell.period) ? next.delete(cell.period) : next.set(cell.period, cell)
      return next
    })
  }

  function getCellDateRange(period) {
    if (currentLevel === 'hour') {
      const date = drillStack[drillStack.length - 1]?.dateFrom?.substring(0, 10) ?? ''
      const h = period.padStart(2, '0')
      return { dateFrom: `${date}T${h}:00:00`, dateTo: `${date}T${h}:59:59` }
    }
    return dateRangeForPeriod(period, currentLevel)
  }

  async function handleDeleteHours() {
    setDelLoading(true)
    setDelError(null)
    try {
      const dayContext = drillStack[drillStack.length - 1]
      const date = dayContext?.dateFrom?.substring(0, 10)
      for (const [period] of selectedPeriods) {
        const h = period.padStart(2, '0')
        await deleteByRange(cameraId, `${date}T${h}:00:00`, `${date}T${h}:59:59`)
      }
      setSelMode(false)
      setDelConfirm(false)
      setSelectedPeriods(new Map())
      onFilesDeleted()
    } catch (e) {
      setDelError(e.message)
    } finally {
      setDelLoading(false)
    }
  }

  async function handleAnalyzeCells(provider, model, confidence) {
    setAnalyzing(true)
    setAnalyzeError(null)
    setAnalyzeProgress('')
    try {
      const cells = [...selectedPeriods.values()]

      if (provider === 'openvino') {
        for (let i = 0; i < cells.length; i++) {
          setAnalyzeProgress(`${i + 1}/${cells.length}`)
          const { dateFrom, dateTo } = getCellDateRange(cells[i].period)
          const videoMode = localStorage.getItem('video_preview_mode') || 'none'
          await openvinoAnalyzeRange({ cameraId, dateFrom, dateTo, modelName: model, confidence, classes: getClassesList(), videoThumbMode: videoMode })
        }
      } else {
        const apiKey = localStorage.getItem(provider === 'gemini' ? 'gemini_api_key' : 'claude_api_key')
        if (!apiKey) throw new Error(`No ${provider === 'gemini' ? 'Gemini' : 'Claude'} API key. Open Tools → AI.`)
        const fileIds = []
        for (const cell of cells) {
          const { dateFrom, dateTo } = getCellDateRange(cell.period)
          const data = await getPreviews(cameraId, dateFrom, dateTo, 1)
          if (data.file_ids?.length) fileIds.push(...data.file_ids)
        }
        if (!fileIds.length) throw new Error('No photos in the selected cells')
        const prompt = CELL_ANALYSIS_PROMPT(fileIds.length)
        if (provider === 'gemini') {
          await geminiAnalyzeBatch({ fileIds, model, apiKey, prompt })
        } else {
          await claudeAnalyzeBatch({ fileIds, model, apiKey, prompt })
        }
      }

      setAiRefreshKey(k => k + 1)
    } catch (e) {
      setAnalyzeError(e.message)
    } finally {
      setAnalyzing(false)
      setAnalyzeProgress('')
    }
  }

  async function handleSendCellsToTask(provider, model, confidence) {
    setTaskSent(false)
    setTaskError(null)
    const apiKey = provider === 'gemini'
      ? localStorage.getItem('gemini_api_key') || ''
      : provider === 'claude'
        ? localStorage.getItem('claude_api_key') || ''
        : null
    if ((provider === 'gemini' || provider === 'claude') && !apiKey) {
      setTaskError(`No ${provider === 'gemini' ? 'Gemini' : 'Claude'} API key`)
      return
    }
    try {
      const cells = [...selectedPeriods.values()]
      for (const cell of cells) {
        const { dateFrom, dateTo } = getCellDateRange(cell.period)
        const typeName = { openvino: 'YOLO', gemini: 'Gemini', claude: 'Claude' }[provider] || provider
        const label = `${typeName} · ${cameraId} · ${dateFrom.slice(0, 10)}`
        const params = { camera_id: cameraId, date_from: dateFrom, date_to: dateTo }
        if (provider === 'openvino') { params.model_name = model; params.confidence = confidence; params.classes = getClassesList() }
        else { params.model = model; params.api_key = apiKey }
        await createTask({ type: provider, params, label })
      }
      setTaskSent(true)
    } catch (e) {
      setTaskError(e.message)
    }
  }

  return {
    selMode, setSelMode, selectedPeriods, setSelectedPeriods,
    delLoading, delError, delConfirm, setDelConfirm,
    aiRefreshKey, analyzing, analyzeError, analyzeProgress,
    taskSent, taskError,
    closeSelection, handleTogglePeriod, handleDeleteHours,
    handleAnalyzeCells, handleSendCellsToTask,
  }
}
