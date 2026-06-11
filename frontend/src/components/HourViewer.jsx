import './HourViewer.css'
import { useState, useEffect, useRef, useMemo } from 'react'
import { getFiles, getDistribution, getStatsTotal, getAiAnalysis } from '../api.js'
import DeleteConfirmModal from './DeleteConfirmModal.jsx'
import GeminiAnalysisModal from './GeminiAnalysisModal.jsx'
import ClaudeAnalysisModal from './ClaudeAnalysisModal.jsx'
import OpenVinoAnalysisModal from './OpenVinoAnalysisModal.jsx'
import { VIEW_MODES, DEFAULT_VIEW_MODE_KEY, getEnabledViewModes } from './viewModes/index.js'
import PhotoCard from './hour/PhotoCard.jsx'
import VideoCard from './hour/VideoCard.jsx'
import SelectionBar from './hour/SelectionBar.jsx'
import DistributionChart from './hour/DistributionChart.jsx'
import ModeSettingsPanel from './hour/ModeSettingsPanel.jsx'
import AiModePanel from './hour/AiModePanel.jsx'
import Lightbox from './hour/Lightbox.jsx'
import { useHourKeyboard } from './hour/useHourKeyboard.js'
import { useHourDelete } from './hour/useHourDelete.js'
import { markHourViewed } from '../viewedStatus.js'
import {
  getPageSize, getHoverZoom, getThumbWidth, buildInitialModeParams,
  saveModeParams, recordAiRequest, VIEW_MODE_KEY,
  getBurstGap, BURST_GAP_KEY,
} from './hour/hourUtils.js'

export default function HourViewer({ cameraId, camera, dateFrom, dateTo, label, onBack, onFilesDeleted }) {
  const [files, setFiles]               = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [pageSize, setPageSize]         = useState(getPageSize)
  const [hoverZoom, setHoverZoom]       = useState(getHoverZoom)
  const [thumbWidth, setThumbWidth]     = useState(getThumbWidth)
  const [burstGap, setBurstGap]         = useState(getBurstGap)
  const [viewMode, setViewMode]         = useState(() => localStorage.getItem(VIEW_MODE_KEY) || DEFAULT_VIEW_MODE_KEY)
  const [modeParams, setModeParams]     = useState(buildInitialModeParams)
  const [peekOriginal, setPeekOriginal] = useState(false)
  const [distribution, setDistribution] = useState([])
  const [hourStats, setHourStats]       = useState(null)

  const [selectionMode, setSelectionMode]     = useState(false)
  const [selectedMap, setSelectedMap]         = useState(new Map())
  const [internalRefreshKey, setInternalRefreshKey] = useState(0)

  const [geminiOpen, setGeminiOpen]         = useState(false)
  const [geminiStructured, setGeminiStructured] = useState(false)
  const [claudeOpen, setClaudeOpen]         = useState(false)
  const [openVinoOpen, setOpenVinoOpen]     = useState(false)
  const [aiAnalysisMap, setAiAnalysisMap]   = useState(new Map())
  const [aiStatsKey, setAiStatsKey]         = useState(0)

  const [focusedFileIndex, setFocusedFileIndex] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const gridRef = useRef(null)
  const anchorIdxRef = useRef(null)
  const anchorActionRef = useRef(null)  // true = selecting, false = deselecting

  const selectedIds = useMemo(() => new Set(selectedMap.keys()), [selectedMap])

  const selectionStats = useMemo(() => {
    let photos = 0, videos = 0, bytes = 0
    for (const f of selectedMap.values()) {
      f.file_type === 'photo' ? photos++ : videos++
      bytes += f.file_size || 0
    }
    return { photos, videos, bytes }
  }, [selectedMap])

  const del = useHourDelete({
    cameraId, dateFrom, dateTo, files, selectedIds,
    onBack, onFilesDeleted,
    onClearSelection: () => {
      setSelectionMode(false)
      setSelectedMap(new Map())
      anchorIdxRef.current = null
      anchorActionRef.current = null
    },
    onRefresh: () => setInternalRefreshKey(k => k + 1),
  })

  useEffect(() => {
    function onPageSize()   { setPageSize(getPageSize()); setPage(1) }
    function onZoom()       { setHoverZoom(getHoverZoom()) }
    function onThumbWidth() { setThumbWidth(getThumbWidth()) }
    function onBurstGap(e)  { setBurstGap(e.detail) }
    document.addEventListener('hour-page-size-change', onPageSize)
    document.addEventListener('hover-zoom-change', onZoom)
    document.addEventListener('thumb-width-change', onThumbWidth)
    document.addEventListener('burst-gap-change', onBurstGap)
    return () => {
      document.removeEventListener('hour-page-size-change', onPageSize)
      document.removeEventListener('hover-zoom-change', onZoom)
      document.removeEventListener('thumb-width-change', onThumbWidth)
      document.removeEventListener('burst-gap-change', onBurstGap)
    }
  }, [])

  useEffect(() => {
    markHourViewed(cameraId, dateFrom)
  }, [cameraId, dateFrom])

  useEffect(() => {
    getDistribution(cameraId, dateFrom, dateTo)
      .then(data => setDistribution(data.buckets ?? []))
      .catch(() => setDistribution([]))
  }, [cameraId, dateFrom, dateTo, internalRefreshKey])

  useEffect(() => {
    getStatsTotal(cameraId, dateFrom, dateTo)
      .then(setHourStats)
      .catch(() => setHourStats(null))
  }, [cameraId, dateFrom, dateTo, internalRefreshKey])

  useEffect(() => {
    setLoading(true)
    getFiles(cameraId, dateFrom, dateTo, page, pageSize)
      .then(data => { setFiles(data.files ?? []); setTotal(data.total ?? 0) })
      .catch(() => { setFiles([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [cameraId, dateFrom, dateTo, page, pageSize, internalRefreshKey])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pagePhotoIds = useMemo(
    () => files.filter(f => f.file_type === 'photo').map(f => f.id),
    [files]
  )

  const burstStartSet = useMemo(() => {
    const set = new Set()
    const gapMs = burstGap * 1000
    for (let i = 1; i < files.length; i++) {
      const tPrev = new Date(files[i - 1].timestamp).getTime()
      const tCurr = new Date(files[i].timestamp).getTime()
      if (tCurr - tPrev >= gapMs) set.add(i)
    }
    return set
  }, [files, burstGap])

  function toggleSelectionMode() {
    setSelectionMode(v => !v)
    setSelectedMap(new Map())
    anchorIdxRef.current = null
    anchorActionRef.current = null
    del.resetMessages()
  }

  function toggleSelect(file, idx, shiftKey) {
    setSelectedMap(prev => {
      const next = new Map(prev)
      if (shiftKey && anchorIdxRef.current !== null) {
        const lo = Math.min(anchorIdxRef.current, idx)
        const hi = Math.max(anchorIdxRef.current, idx)
        const adding = anchorActionRef.current
        for (let i = lo; i <= hi; i++) {
          if (adding) next.set(files[i].id, files[i])
          else next.delete(files[i].id)
        }
      } else {
        const wasSelected = next.has(file.id)
        wasSelected ? next.delete(file.id) : next.set(file.id, file)
        anchorIdxRef.current = idx
        anchorActionRef.current = !wasSelected
      }
      return next
    })
  }

  // Reset focused file when page content changes
  useEffect(() => { setFocusedFileIndex(null) }, [files])

  // Load AI analysis for current page photos
  useEffect(() => {
    const ids = files.filter(f => f.file_type === 'photo').map(f => f.id)
    if (!ids.length) { setAiAnalysisMap(new Map()); return }
    getAiAnalysis(ids)
      .then(rows => setAiAnalysisMap(new Map(rows.map(r => [r.file_id, r]))))
      .catch(() => {})
  }, [files])

  function reloadAiAnalysis() {
    const ids = files.filter(f => f.file_type === 'photo').map(f => f.id)
    if (!ids.length) return
    getAiAnalysis(ids)
      .then(rows => setAiAnalysisMap(new Map(rows.map(r => [r.file_id, r]))))
      .catch(() => {})
  }

  // Debounced reload triggered by each bbox thumbnail finishing load in OpenVINO mode.
  // Waits 1.5 s after the last load event so one DB call covers all visible photos.
  const _ovReloadTimer = useRef(null)
  function handleOpenVinoImageLoad() {
    clearTimeout(_ovReloadTimer.current)
    _ovReloadTimer.current = setTimeout(() => reloadAiAnalysis(), 1500)
  }

  function handleViewModeChange(e) {
    const v = e.target.value
    setViewMode(v)
    localStorage.setItem(VIEW_MODE_KEY, v)
  }

  function handleModeParamChange(modeKey, paramKey, value) {
    setModeParams(prev => {
      const next = { ...prev, [modeKey]: { ...prev[modeKey], [paramKey]: value } }
      saveModeParams(modeKey, next[modeKey])
      return next
    })
  }

  useHourKeyboard({
    selectionMode, totalPages, files, selectedIds, focusedFileIndex, onBack,
    gridRef, anchorIdxRef, anchorActionRef,
    setPage, setFocusedFileIndex, setViewMode, setSelectionMode,
    setSelectedMap, setInternalRefreshKey, setPeekOriginal,
    toggleSelectionMode,
    handleDeletePreview: del.handleDeletePreview,
    handleDeleteAll: del.handleDeleteAll,
    handleDeleteHourPreview: del.handleDeleteHourPreview,
    lightboxOpen: lightboxIndex !== null,
  })

  const enabledModes = getEnabledViewModes()
  const activeMode = enabledModes.find(m => m.key === viewMode) ?? enabledModes[0]
  const activeModeParams = modeParams[viewMode] ?? {}

  return (
    <div className="hv-root">
      {/* Header with inline pagination */}
      <div className="hv-header">
        <button className="hv-back-btn" onClick={onBack}>
          <i className="mdi mdi-arrow-left" /> Back
        </button>
        <span className="hv-title">
          <i className="mdi mdi-clock-outline" /> {label}
        </span>

        {totalPages > 1 && (
          <div className="hv-header-pag">
            <button className="hv-page-btn" onClick={() => setPage(1)} disabled={page === 1}>
              <i className="mdi mdi-chevron-double-left" />
            </button>
            <button className="hv-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <i className="mdi mdi-chevron-left" />
            </button>
            <span className="hv-page-info">{page} / {totalPages}</span>
            <button className="hv-page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
              <i className="mdi mdi-chevron-right" />
            </button>
            <button className="hv-page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
              <i className="mdi mdi-chevron-double-right" />
            </button>
          </div>
        )}

        <select className="hv-view-mode-select" value={viewMode} onChange={handleViewModeChange} title={activeMode?.description}>
          {enabledModes.map(m => <option key={m.key} value={m.key} title={m.description}>{m.label}</option>)}
        </select>

        {!selectionMode && total > 0 && (
          <button
            className="hv-select-btn"
            style={{ color: '#f87171' }}
            onClick={del.handleDeleteHourPreview}
            disabled={del.hourPreviewLoading}
            title="Delete all files in this hour (Backspace)"
          >
            {del.hourPreviewLoading
              ? <i className="mdi mdi-loading mdi-spin" />
              : <><i className="mdi mdi-delete-sweep-outline" /> Delete hour</>
            }
          </button>
        )}

        <button
          className={`hv-select-btn${selectionMode ? ' active' : ''}`}
          onClick={toggleSelectionMode}
        >
          <i className={`mdi mdi-${selectionMode ? 'close' : 'checkbox-multiple-marked-outline'}`} />
          {selectionMode ? 'Cancel' : 'Select'}
        </button>

        <span className="hv-count">{total.toLocaleString()} files</span>
      </div>

      {/* Mode settings panel */}
      {!peekOriginal && activeMode.isAiMode && (
        <AiModePanel
          provider={activeMode.aiProvider}
          description={activeMode.description}
          files={files}
          selectedIds={selectedIds}
          aiAnalysisMap={aiAnalysisMap}
          statsKey={aiStatsKey}
          params={activeModeParams}
          onParamChange={(k, v) => handleModeParamChange(viewMode, k, v)}
          onRun={() => {
            if (activeMode.aiProvider === 'claude') {
              setClaudeOpen(true)
            } else if (activeMode.aiProvider === 'openvino') {
              setOpenVinoOpen(true)
            } else {
              setGeminiStructured(true)
              setGeminiOpen(true)
            }
          }}
        />
      )}
      {!peekOriginal && !activeMode.isAiMode && activeMode.params?.length > 0 && (
        <ModeSettingsPanel
          mode={activeMode}
          params={activeModeParams}
          onChange={(paramKey, value) => handleModeParamChange(viewMode, paramKey, value)}
        />
      )}
      {peekOriginal && (
        <div className="hv-peek-banner">
          <i className="mdi mdi-eye-outline" /> Viewing originals — hold N
        </div>
      )}

      {/* Distribution chart */}
      {distribution.length > 0 && (
        <DistributionChart
          buckets={distribution}
          pageSize={pageSize}
          page={page}
          total={total}
          onGoToPage={setPage}
          hourStats={hourStats}
        />
      )}

      {/* Selection bar (horizontal, below chart) */}
      {selectionMode && (
        <SelectionBar
          files={files}
          selectedCount={selectedIds.size}
          selectionStats={selectionStats}
          onSelectAll={() => setSelectedMap(new Map(files.map(f => [f.id, f])))}
          onSelectNone={() => setSelectedMap(new Map())}
          onDelete={del.handleDeletePreview}
          onCancel={toggleSelectionMode}
          loading={del.previewLoading}
        />
      )}

      {/* File grid */}
      {loading ? (
        <div className="hv-grid" style={{ '--thumb-w': `${thumbWidth}px` }}>
          {Array.from({ length: Math.min(pageSize, 12) }).map((_, i) => (
            <div key={i} className="hv-card hv-card-skeleton skeleton" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="hv-empty">
          <i className="mdi mdi-folder-open-outline" /> No files in this hour.
        </div>
      ) : (
        <div ref={gridRef} className="hv-grid" style={{ '--thumb-w': `${thumbWidth}px` }}>
          {files.map((file, index) =>
            file.file_type === 'video'
              ? <VideoCard
                  key={file.id}
                  file={file}
                  index={index}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleSelect}
                  isFocused={index === focusedFileIndex}
                  isBurstStart={burstStartSet.has(index)}
                  onOpenLightbox={setLightboxIndex}
                />
              : <PhotoCard
                  key={file.id}
                  file={file}
                  index={index}
                  hoverZoom={hoverZoom}
                  mode={peekOriginal ? VIEW_MODES[0] : activeMode}
                  pagePhotoIds={pagePhotoIds}
                  params={peekOriginal ? {} : activeModeParams}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleSelect}
                  isFocused={index === focusedFileIndex}
                  isBurstStart={burstStartSet.has(index)}
                  aiData={aiAnalysisMap.get(file.id) ?? null}
                  onImageLoad={activeMode.aiProvider === 'openvino' ? handleOpenVinoImageLoad : undefined}
                  onOpenLightbox={setLightboxIndex}
                />
          )}
        </div>
      )}

      {del.deleteError && !del.preview && !del.hourPreview && (
        <div className="hv-delete-error">
          <i className="mdi mdi-alert-circle-outline" /> {del.deleteError}
        </div>
      )}
      {del.deleteSuccess && !del.preview && !del.hourPreview && (
        <div className="hv-delete-success">
          <i className="mdi mdi-check-circle-outline" /> {del.deleteSuccess}
        </div>
      )}
      {del.hourDeleteError && !del.hourPreview && (
        <div className="hv-delete-error">
          <i className="mdi mdi-alert-circle-outline" /> {del.hourDeleteError}
        </div>
      )}

      {del.preview && (
        <DeleteConfirmModal
          preview={del.preview}
          onConfirm={del.handleDeleteConfirm}
          onCancel={del.cancelPreview}
          busy={del.deleteLoading}
          error={del.deleteError}
          camera={camera}
        />
      )}

      {del.hourPreview && (
        <DeleteConfirmModal
          preview={del.hourPreview}
          onConfirm={del.handleDeleteHourConfirm}
          onCancel={del.cancelHourPreview}
          busy={del.hourDeleteLoading}
          error={del.hourDeleteError}
          camera={camera}
        />
      )}

      {geminiOpen && (() => {
        const photoFiles = files.filter(f => f.file_type === 'photo')
        const ids = selectedIds.size > 0
          ? photoFiles.filter(f => selectedIds.has(f.id)).map(f => f.id)
          : photoFiles.map(f => f.id)
        return (
          <GeminiAnalysisModal
            fileIds={ids}
            structured={geminiStructured}
            taskContext={{ cameraId, dateFrom, dateTo }}
            onClose={() => { setGeminiOpen(false); setGeminiStructured(false) }}
            onComplete={() => { recordAiRequest('gemini'); setAiStatsKey(k => k + 1); reloadAiAnalysis() }}
          />
        )
      })()}

      {claudeOpen && (() => {
        const photoFiles = files.filter(f => f.file_type === 'photo')
        const ids = selectedIds.size > 0
          ? photoFiles.filter(f => selectedIds.has(f.id)).map(f => f.id)
          : photoFiles.map(f => f.id)
        return (
          <ClaudeAnalysisModal
            fileIds={ids}
            taskContext={{ cameraId, dateFrom, dateTo }}
            onClose={() => setClaudeOpen(false)}
            onComplete={() => { recordAiRequest('claude'); setAiStatsKey(k => k + 1); reloadAiAnalysis() }}
          />
        )
      })()}

      {lightboxIndex !== null && (
        <Lightbox
          files={files}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {openVinoOpen && (() => {
        const photoFiles = files.filter(f => f.file_type === 'photo')
        const ids = selectedIds.size > 0
          ? photoFiles.filter(f => selectedIds.has(f.id)).map(f => f.id)
          : photoFiles.map(f => f.id)
        const model = localStorage.getItem('openvino_model') || 'yolov8n'
        return (
          <OpenVinoAnalysisModal
            fileIds={ids}
            model={model}
            confidencePct={modeParams.openvino_detection?.confidence ?? 25}
            onConfidencePctChange={v => handleModeParamChange('openvino_detection', 'confidence', v)}
            taskContext={{ cameraId, dateFrom, dateTo }}
            onClose={() => setOpenVinoOpen(false)}
            onComplete={() => { recordAiRequest('openvino'); setAiStatsKey(k => k + 1); reloadAiAnalysis() }}
          />
        )
      })()}

      <div style={{
        fontSize: 'calc(var(--font-base) * 0.72)',
        color: 'var(--text-dim)',
        textAlign: 'center',
        paddingTop: 4,
        userSelect: 'none',
      }}>
        {selectionMode ? (
          <>
            <Kbd>↑ ↓ ← →</Kbd> navigate + extend &nbsp;·&nbsp;
            <Kbd>Space</Kbd> toggle item &nbsp;·&nbsp;
            <Kbd>Shift+click</Kbd> range &nbsp;·&nbsp;
            <Kbd>Ctrl+A</Kbd> select all &nbsp;·&nbsp;
            <Kbd>Delete</Kbd> delete selected &nbsp;·&nbsp;
            <Kbd>⌫</Kbd> delete hour &nbsp;·&nbsp;
            <Kbd>Esc</Kbd> exit
          </>
        ) : (
          <>
            <Kbd>↑ ↓ ← →</Kbd> navigate &nbsp;·&nbsp;
            <Kbd>Enter</Kbd> open &nbsp;·&nbsp;
            <Kbd>PgUp PgDn</Kbd> page &nbsp;·&nbsp;
            <Kbd>M</Kbd> / <Kbd>P</Kbd> mode ±1 &nbsp;·&nbsp;
            <Kbd>N</Kbd> peek original &nbsp;·&nbsp;
            <Kbd>S</Kbd> save (in viewer) &nbsp;·&nbsp;
            <Kbd>T</Kbd> save preview (in viewer) &nbsp;·&nbsp;
            <Kbd>Ctrl+R</Kbd> refresh &nbsp;·&nbsp;
            <Kbd>Ctrl+A</Kbd> select all &nbsp;·&nbsp;
            <Kbd>Space</Kbd> select &nbsp;·&nbsp;
            <Kbd>Del</Kbd> delete &nbsp;·&nbsp;
            <Kbd>⌫</Kbd> delete hour &nbsp;·&nbsp;
            <Kbd>Esc</Kbd> back
          </>
        )}
      </div>
    </div>
  )
}

function Kbd({ children }) {
  return (
    <kbd style={{
      background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '3px', padding: '0px 4px',
      fontSize: 'inherit', fontFamily: 'inherit',
    }}>{children}</kbd>
  )
}
