import { useEffect } from 'react'
import { getEnabledViewModes } from '../viewModes/index.js'
import { VIEW_MODE_KEY } from './hourUtils.js'

/**
 * All keyboard handling for the hour viewer, kept out of the main component.
 * Three independent listeners:
 *   - peek original (hold N)
 *   - browse-mode keys (active when not in selection mode)
 *   - selection-mode keys (active when in selection mode)
 *
 * `ctx` carries the state, setters, refs and delete handlers owned by HourViewer.
 */
export function useHourKeyboard(ctx) {
  const {
    selectionMode, totalPages, files, selectedIds, focusedFileIndex, onBack,
    gridRef, anchorIdxRef, anchorActionRef,
    setPage, setFocusedFileIndex, setViewMode, setSelectionMode,
    setSelectedMap, setInternalRefreshKey, setPeekOriginal,
    toggleSelectionMode, handleDeletePreview, handleDeleteAll, handleDeleteHourPreview,
  } = ctx

  function getGridCols() {
    if (!gridRef.current) return 4
    const cards = gridRef.current.querySelectorAll('.hv-card')
    if (cards.length < 2) return 1
    const firstTop = cards[0].getBoundingClientRect().top
    let cols = 0
    for (const card of cards) {
      if (Math.round(card.getBoundingClientRect().top) !== Math.round(firstTop)) break
      cols++
    }
    return Math.max(1, cols)
  }

  // ── Peek original (hold N) ──────────────────────────────────────────────────
  useEffect(() => {
    function onDown(e) {
      if (e.key !== 'n' && e.key !== 'N') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      setPeekOriginal(true)
    }
    function onUp(e) {
      if (e.key === 'n' || e.key === 'N') setPeekOriginal(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // ── Browse-mode keys (not in selection mode) ────────────────────────────────
  useEffect(() => {
    if (selectionMode) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onBack()
      } else if (e.key === 'Backspace' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        handleDeleteHourPreview()
      } else if (e.key === 'PageUp') {
        e.preventDefault(); setPage(p => Math.max(1, p - 1))
      } else if (e.key === 'PageDown') {
        e.preventDefault(); setPage(p => Math.min(totalPages, p + 1))
      } else if (e.key === 'Home') {
        e.preventDefault(); setPage(1)
      } else if (e.key === 'End') {
        e.preventDefault(); setPage(totalPages)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (files.length === 0) return
        e.preventDefault()
        const cols = getGridCols()
        setFocusedFileIndex(prev => {
          const cur = prev ?? 0
          let next = cur
          if (e.key === 'ArrowRight') next = cur + 1
          else if (e.key === 'ArrowLeft') next = cur - 1
          else if (e.key === 'ArrowDown') next = cur + cols
          else if (e.key === 'ArrowUp') next = cur - cols
          return Math.max(0, Math.min(files.length - 1, next))
        })
      } else if (e.key === 'Enter') {
        if (focusedFileIndex !== null && gridRef.current) {
          const cards = gridRef.current.querySelectorAll('.hv-card')
          cards[focusedFileIndex]?.click()
        }
      } else if (e.key === 'Insert' || e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setViewMode(prev => {
          const modes = getEnabledViewModes()
          const idx = modes.findIndex(m => m.key === prev)
          const next = modes[(idx + 1) % modes.length].key
          localStorage.setItem(VIEW_MODE_KEY, next)
          return next
        })
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setViewMode(prev => {
          const modes = getEnabledViewModes()
          const idx = modes.findIndex(m => m.key === prev)
          const next = modes[(idx - 1 + modes.length) % modes.length].key
          localStorage.setItem(VIEW_MODE_KEY, next)
          return next
        })
      } else if (e.key === ' ') {
        e.preventDefault()
        const idx = focusedFileIndex ?? 0
        const f = files[idx]
        setSelectionMode(true)
        if (f) {
          setSelectedMap(new Map([[f.id, f]]))
          setFocusedFileIndex(idx)
          anchorIdxRef.current = idx
          anchorActionRef.current = true
        }
      } else if (e.key === 'Delete') {
        e.preventDefault()
        if (selectedIds.size > 0) handleDeletePreview()
        else handleDeleteAll()
      } else if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        setInternalRefreshKey(k => k + 1)
      } else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        setSelectionMode(true)
        setSelectedMap(new Map(files.map(f => [f.id, f])))
        anchorIdxRef.current = 0
        anchorActionRef.current = true
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, totalPages, files, selectedIds, onBack, focusedFileIndex])

  // ── Selection-mode keys ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectionMode) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleSelectionMode()
        return
      }
      if (e.key === 'Backspace' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        handleDeleteHourPreview()
        return
      }
      if (e.key === 'Delete') {
        e.preventDefault()
        if (selectedIds.size > 0) handleDeletePreview()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        const idx = focusedFileIndex ?? anchorIdxRef.current
        if (idx !== null && idx !== undefined && files[idx]) {
          const f = files[idx]
          setSelectedMap(prev => {
            const next = new Map(prev)
            const wasSelected = next.has(f.id)
            wasSelected ? next.delete(f.id) : next.set(f.id, f)
            anchorIdxRef.current = idx
            anchorActionRef.current = !wasSelected
            return next
          })
        }
        return
      }
      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        setSelectedMap(new Map(files.map(f => [f.id, f])))
        anchorIdxRef.current = 0
        anchorActionRef.current = true
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      if (files.length === 0) return
      e.preventDefault()
      const cols = getGridCols()
      const curIdx = focusedFileIndex ?? anchorIdxRef.current ?? 0
      let nextIdx = curIdx
      if (e.key === 'ArrowRight') nextIdx = curIdx + 1
      else if (e.key === 'ArrowLeft') nextIdx = curIdx - 1
      else if (e.key === 'ArrowDown') nextIdx = curIdx + cols
      else if (e.key === 'ArrowUp') nextIdx = curIdx - cols
      nextIdx = Math.max(0, Math.min(files.length - 1, nextIdx))
      if (nextIdx !== curIdx && anchorActionRef.current !== null) {
        setSelectedMap(prev => {
          const next = new Map(prev)
          const f = files[nextIdx]
          if (anchorActionRef.current) next.set(f.id, f)
          else next.delete(f.id)
          return next
        })
      }
      setFocusedFileIndex(nextIdx)
      anchorIdxRef.current = nextIdx
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, files, selectedIds, focusedFileIndex])
}
