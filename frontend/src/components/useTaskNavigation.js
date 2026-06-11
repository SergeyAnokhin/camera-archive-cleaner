import { useState } from 'react'
import { getAiAnalysisInRange } from '../api.js'

// Navigation from the Tasks screen back into the heatmap / hour viewer:
// opens TaskResultsModal for a finished task, or drills to the task's period.
export function useTaskNavigation({ setCameraId, setDrillStack, setSelectedHour, setShowTasks, setShowTuning }) {
  const [taskResultsModal, setTaskResultsModal] = useState(null) // {task, results, stats}

  async function handleNavigateFromTask(task) {
    const params = task.params || {}
    const camId = params.camera_id
    if (!camId || !params.date_from || !params.date_to) return
    try {
      const data = await getAiAnalysisInRange(camId, params.date_from, params.date_to, task.type)
      setTaskResultsModal({ task, results: data.results ?? [], stats: data.stats ?? null })
    } catch {
      // fallback: navigate to heatmap
      navigateToTaskPeriod(task)
    }
  }

  function navigateToTaskPeriod(task) {
    const params = task.params || {}
    const camId = params.camera_id
    const dateStr = params.date_from
    if (!camId || !dateStr) return
    const year  = dateStr.slice(0, 4)
    const month = dateStr.slice(0, 7)
    const lastDay = new Date(+year, +month.slice(5), 0).getDate()
    setCameraId(camId)
    setDrillStack([
      { level: 'year',  label: year,  dateFrom: `${year}-01-01T00:00:00`,  dateTo: `${year}-12-31T23:59:59` },
      { level: 'month', label: month, dateFrom: `${month}-01T00:00:00`, dateTo: `${month}-${String(lastDay).padStart(2,'0')}T23:59:59` },
    ])
    setSelectedHour(null)
    setShowTasks(false)
    setShowTuning(false)
  }

  function handleNavigateToHour(timestamp) {
    // timestamp: "2024-07-30T17:29:54"
    const date  = timestamp.slice(0, 10)
    const hour  = timestamp.slice(11, 13)
    const year  = date.slice(0, 4)
    const month = date.slice(0, 7)
    const lastDay = new Date(+year, +month.slice(5), 0).getDate()
    const taskCamId = taskResultsModal?.task?.params?.camera_id
    setTaskResultsModal(null)
    if (taskCamId) setCameraId(taskCamId)
    setDrillStack([
      { level: 'year',  label: year,  dateFrom: `${year}-01-01T00:00:00`,  dateTo: `${year}-12-31T23:59:59` },
      { level: 'month', label: month, dateFrom: `${month}-01T00:00:00`, dateTo: `${month}-${String(lastDay).padStart(2,'0')}T23:59:59` },
      { level: 'day',   label: date,  dateFrom: `${date}T00:00:00`,      dateTo: `${date}T23:59:59` },
    ])
    setSelectedHour({ dateFrom: `${date}T${hour}:00:00`, dateTo: `${date}T${hour}:59:59`, label: `${date} ${hour}:00` })
    setShowTasks(false)
    setShowTuning(false)
  }

  return { taskResultsModal, setTaskResultsModal, handleNavigateFromTask, handleNavigateToHour }
}
