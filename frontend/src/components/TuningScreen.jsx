import { useState, useEffect, useCallback } from 'react'
import {
  getTuningSessions, getTuningSession, deleteTuningSession,
  runAutolabel, saveTuningGroundTruth, startTuningBenchmark,
} from '../api.js'
import { S, Err, STATUS_LABEL, STATUS_COLOR, STEP_TITLES } from './tuning/tuningShared.jsx'
import NewSessionForm from './tuning/NewSessionForm.jsx'
import GroundTruthStep from './tuning/GroundTruthStep.jsx'
import BenchmarkStep from './tuning/BenchmarkStep.jsx'
import ResultsStep from './tuning/ResultsStep.jsx'

// Orchestrator: session sidebar + 3-step panel. Steps live in tuning/.
export default function TuningScreen() {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [activeStep, setActiveStep] = useState(0)
  const [showingNewForm, setShowingNewForm] = useState(false)
  const [error, setError] = useState(null)

  const [groundTruth, setGroundTruth] = useState({})
  const [autolabeling, setAutolabeling] = useState(false)
  const [savingGT, setSavingGT] = useState(false)
  const [startingBench, setStartingBench] = useState(false)
  const [stepError, setStepError] = useState(null)

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await getTuningSessions())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  // Poll active session while the benchmark runs
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'running') return
    const id = setInterval(async () => {
      try {
        const data = await getTuningSession(activeSession.id)
        setActiveSession(data)
        setSessions(prev => prev.map(s => s.id === data.id
          ? { ...s, status: data.status, progress_current: data.progress_current, progress_total: data.progress_total }
          : s))
        if (data.status === 'done') setActiveStep(2)
        if (data.status === 'failed') setStepError(data.error_message)
      } catch {}
    }, 2000)
    return () => clearInterval(id)
  }, [activeSession?.id, activeSession?.status])

  async function handleSelectSession(s) {
    setStepError(null); setError(null)
    try {
      const full = await getTuningSession(s.id)
      setActiveSession(full)
      setGroundTruth(JSON.parse(full.ground_truth || '{}'))
      setShowingNewForm(false)
      const stepMap = { setup: 0, ready: 1, running: 1, done: 2, failed: 1 }
      setActiveStep(stepMap[full.status] ?? 0)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeleteSession(id, e) {
    e.stopPropagation()
    try {
      await deleteTuningSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (activeSession?.id === id) { setActiveSession(null); setShowingNewForm(false) }
    } catch (e) {
      setError(e.message)
    }
  }

  function handleSessionCreated(session) {
    loadSessions()
    setActiveSession(session)
    setGroundTruth({})
    setActiveStep(0)
    setShowingNewForm(false)
    setStepError(null)
  }

  function handleGTChange(imageId, objects) {
    setGroundTruth(prev => ({ ...prev, [imageId]: objects }))
  }

  async function handleAutolabel({ model, confidence }) {
    if (!activeSession) return
    setAutolabeling(true); setStepError(null)
    try {
      const result = await runAutolabel(activeSession.id, { model, confidence })
      setGroundTruth(result.ground_truth)
    } catch (e) {
      setStepError(e.message)
    } finally {
      setAutolabeling(false)
    }
  }

  async function handleSaveGT() {
    if (!activeSession) return
    setSavingGT(true); setStepError(null)
    try {
      await saveTuningGroundTruth(activeSession.id, groundTruth)
      const updated = await getTuningSession(activeSession.id)
      setActiveSession(updated)
      setSessions(prev => prev.map(s => s.id === updated.id ? { ...s, status: updated.status } : s))
      setActiveStep(1)
    } catch (e) {
      setStepError(e.message)
    } finally {
      setSavingGT(false)
    }
  }

  async function handleStartBenchmark(cfg) {
    if (!activeSession) return
    setStartingBench(true); setStepError(null)
    try {
      await startTuningBenchmark(activeSession.id, cfg)
      const updated = await getTuningSession(activeSession.id)
      setActiveSession(updated)
      setSessions(prev => prev.map(s => s.id === updated.id ? { ...s, status: updated.status } : s))
    } catch (e) {
      setStepError(e.message)
    } finally {
      setStartingBench(false)
    }
  }

  const imageCount = activeSession ? JSON.parse(activeSession.images || '[]').length : 0

  return (
    <div style={S.outer}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.sidebarHeader}>Tuning sessions</div>
        <div style={{ padding: '10px 12px 8px' }}>
          <button
            className="modal-btn primary"
            style={{ width: '100%', fontSize: 'calc(var(--font-base) * 0.85)' }}
            onClick={() => { setShowingNewForm(true); setActiveSession(null); setStepError(null) }}
          >
            <i className="mdi mdi-plus" /> New session
          </button>
        </div>

        {sessions.length === 0 && (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>No sessions</div>
        )}

        {sessions.map(s => (
          <div key={s.id} style={S.sidebarItem(activeSession?.id === s.id)} onClick={() => handleSelectSession(s)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 'calc(var(--font-base) * 0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <button
                className="modal-btn neutral"
                style={{ padding: '1px 5px', fontSize: 10, flexShrink: 0, lineHeight: '14px' }}
                onClick={e => handleDeleteSession(s.id, e)}
                title="Delete"
              >×</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: STATUS_COLOR[s.status] || '#6b7280', fontWeight: 600 }}>{STATUS_LABEL[s.status] || s.status}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>· {s.image_count} photos</span>
            </div>
            {s.status === 'running' && s.progress_total > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={S.progressBar}><div style={S.progressFill(Math.round((s.progress_current / s.progress_total) * 100))} /></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div style={S.panel}>
        <Err msg={error} />

        {showingNewForm ? (
          <NewSessionForm onCreated={handleSessionCreated} onCancel={() => setShowingNewForm(false)} />
        ) : activeSession ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 'calc(var(--font-base) * 1.05)' }}>{activeSession.name}</span>
                <span style={{ marginLeft: 12, fontSize: 12, color: STATUS_COLOR[activeSession.status] }}>{STATUS_LABEL[activeSession.status]}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{imageCount} images</span>
            </div>

            <div style={S.stepper}>
              {STEP_TITLES.map((title, i) => (
                <button key={i} style={S.stepBtn(activeStep === i)} onClick={() => setActiveStep(i)}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                    marginRight: 6, background: activeStep === i ? 'var(--accent)' : '#374151',
                    color: activeStep === i ? '#fff' : '#9ca3af',
                  }}>{i + 1}</span>
                  {title}
                </button>
              ))}
            </div>

            {activeStep === 0 && (
              <GroundTruthStep
                session={activeSession}
                groundTruth={groundTruth}
                onGTChange={handleGTChange}
                onAutolabel={handleAutolabel}
                onSave={handleSaveGT}
                autolabeling={autolabeling}
                saving={savingGT}
                error={stepError}
              />
            )}
            {activeStep === 1 && (
              <BenchmarkStep session={activeSession} onStart={handleStartBenchmark} starting={startingBench} error={stepError} />
            )}
            {activeStep === 2 && <ResultsStep session={activeSession} />}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-dim)' }}>
            <i className="mdi mdi-tune-variant" style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }} />
            <div style={{ marginBottom: 12 }}>Create a session or select an existing one</div>
            <button className="modal-btn primary" style={{ fontSize: 'calc(var(--font-base) * 0.9)' }} onClick={() => setShowingNewForm(true)}>
              <i className="mdi mdi-plus" /> New session
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
