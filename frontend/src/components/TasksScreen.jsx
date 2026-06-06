import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getTasks, createTask, deleteTask, pauseTask, resumeTask, cancelTask,
  reorderTasks, getTaskMetrics,
} from '../api.js'
import TaskCard from './TaskCard.jsx'
import NewTaskModal from './NewTaskModal.jsx'
import './TasksScreen.css'

function formatBytes(b) {
  if (!b) return '—'
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)}G`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)}M`
  return `${Math.round(b / 1e3)}K`
}

function cpuColor(v) {
  if (v > 85) return '#ef4444'
  if (v > 60) return '#f59e0b'
  return 'var(--accent)'
}
function memColor(v) {
  if (v > 85) return '#ef4444'
  if (v > 70) return '#f59e0b'
  return '#22c55e'
}

function MetricsChips({ metrics }) {
  if (!metrics) return null
  const modeIcon  = { off: 'mdi-cancel', local: 'mdi-laptop', remote: 'mdi-server-network' }[metrics.compute_mode] ?? 'mdi-cog'
  const modeLabel = { off: 'Off', local: 'Local', remote: 'Remote' }[metrics.compute_mode] ?? metrics.compute_mode

  if (!metrics.compute_available) {
    return (
      <div className="ts__chips">
        <span className="ts__chip ts__chip--dim">
          <i className={`mdi ${modeIcon}`} /> Compute {modeLabel}
        </span>
      </div>
    )
  }

  return (
    <div className="ts__chips">
      <span className="ts__chip" title={`CPU: ${metrics.cpu_percent?.toFixed(1)}%`}>
        <span className="ts__chip-label">CPU</span>
        <span className="ts__chip-bar-track">
          <span className="ts__chip-bar-fill"
            style={{ width: `${metrics.cpu_percent ?? 0}%`, background: cpuColor(metrics.cpu_percent ?? 0) }} />
        </span>
        <span className="ts__chip-val">{metrics.cpu_percent?.toFixed(0) ?? '—'}%</span>
      </span>
      <span className="ts__chip" title={`RAM: ${formatBytes(metrics.memory_used)} / ${formatBytes(metrics.memory_total)}`}>
        <span className="ts__chip-label">RAM</span>
        <span className="ts__chip-bar-track">
          <span className="ts__chip-bar-fill"
            style={{ width: `${metrics.memory_percent ?? 0}%`, background: memColor(metrics.memory_percent ?? 0) }} />
        </span>
        <span className="ts__chip-val">{formatBytes(metrics.memory_used)}</span>
      </span>
      <span className="ts__chip ts__chip--mode">
        <i className={`mdi ${modeIcon}`} /> {modeLabel}
      </span>
    </div>
  )
}

export default function TasksScreen({ cameras, onNavigate }) {
  const [tasks, setTasks]         = useState([])
  const [metrics, setMetrics]     = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [error, setError]         = useState(null)
  const [dragIdx, setDragIdx]     = useState(null)
  const [overIdx, setOverIdx]     = useState(null)
  const pollRef    = useRef(null)
  const metricsRef = useRef(null)

  const fetchTasks = useCallback(async () => {
    try { setTasks(await getTasks()); setError(null) }
    catch (e) { setError(e.message) }
  }, [])

  const fetchMetrics = useCallback(async () => {
    try { setMetrics(await getTaskMetrics()) } catch {}
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchMetrics()
    pollRef.current    = setInterval(fetchTasks, 3000)
    metricsRef.current = setInterval(fetchMetrics, 6000)
    return () => { clearInterval(pollRef.current); clearInterval(metricsRef.current) }
  }, [fetchTasks, fetchMetrics])

  async function act(fn, ...args) {
    try { await fn(...args); await fetchTasks() }
    catch (e) { setError(e.message) }
  }

  // ── Drag-and-drop ──────────────────────────────────────────────
  function handleDragStart(idx) {
    setDragIdx(idx)
  }

  function handleDragOver(idx) {
    if (idx !== overIdx) setOverIdx(idx)
  }

  async function handleDrop(idx) {
    if (dragIdx === null || dragIdx === idx) return
    const newTasks = [...tasks]
    const [moved] = newTasks.splice(dragIdx, 1)
    newTasks.splice(idx, 0, moved)
    const order = newTasks.map((t, i) => ({ id: t.id, order_index: i }))
    setTasks(newTasks)
    setDragIdx(null)
    setOverIdx(null)
    try { await reorderTasks(order) }
    catch (e) { setError(e.message); fetchTasks() }
  }

  function handleDragEnd() {
    setDragIdx(null)
    setOverIdx(null)
  }

  // ── Helpers ────────────────────────────────────────────────────
  async function handleAdd(taskDef) {
    await createTask(taskDef)
    await fetchTasks()
  }

  async function clearDone() {
    const done = tasks.filter(t => ['completed', 'cancelled', 'failed'].includes(t.status))
    for (const t of done) try { await deleteTask(t.id) } catch {}
    await fetchTasks()
  }

  const hasDone = tasks.some(t => ['completed', 'cancelled', 'failed'].includes(t.status))
  const runningCount = tasks.filter(t => t.status === 'running' || t.status === 'pausing').length
  const queuedCount  = tasks.filter(t => t.status === 'queued').length

  return (
    <div className="ts">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="ts__toolbar">
        <div className="ts__title-row">
          <h2 className="ts__title">
            <i className="mdi mdi-playlist-play" />
            Tasks
            {tasks.length > 0 && <span className="ts__count">{tasks.length}</span>}
            {runningCount > 0 && (
              <span className="ts__running-badge">
                <i className="mdi mdi-loading mdi-spin" /> {runningCount} running
              </span>
            )}
          </h2>
        </div>

        <MetricsChips metrics={metrics} />

        <div className="ts__toolbar-actions">
          {hasDone && (
            <button className="modal-btn neutral ts__clear-btn" onClick={clearDone}>
              <i className="mdi mdi-broom" />
            </button>
          )}
          <button className="modal-btn accent" onClick={() => setShowModal(true)}>
            <i className="mdi mdi-plus" /> New Task
          </button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────── */}
      {error && (
        <div className="ts__error-banner">
          <i className="mdi mdi-alert-circle-outline" /> {error}
        </div>
      )}

      {/* ── Task grid ────────────────────────────────────────── */}
      {tasks.length === 0 ? (
        <div className="ts__empty">
          <i className="mdi mdi-playlist-check ts__empty-icon" />
          <div className="ts__empty-title">No tasks</div>
          <div className="ts__empty-sub">
            Click <strong>+ New Task</strong> to add a processing job
          </div>
        </div>
      ) : (
        <div className="ts__grid">
          {tasks.map((task, idx) => (
            <TaskCard
              key={task.id}
              task={task}
              isDragOver={overIdx === idx && dragIdx !== idx}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={() => handleDragOver(idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              onPause={() => act(pauseTask, task.id)}
              onResume={() => act(resumeTask, task.id)}
              onCancel={() => act(cancelTask, task.id)}
              onDelete={() => act(deleteTask, task.id)}
              onViewResults={onNavigate ? (t) => onNavigate(t) : undefined}
            />
          ))}
        </div>
      )}

      {/* ── New task modal ────────────────────────────────────── */}
      {showModal && (
        <NewTaskModal
          cameras={cameras}
          onAdd={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
