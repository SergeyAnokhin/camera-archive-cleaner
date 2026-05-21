import { useEffect } from 'react'
import { GRID_COLS } from './navUtils.js'

/**
 * Arrow-key navigation plus selection/delete shortcuts for the heatmap grid.
 * Inactive while the HourViewer is open. `ctx` carries the state, setters,
 * refs and handlers owned by App.
 */
export function useHeatmapKeyboard(ctx) {
  const {
    selectedHour, periods, focusedPeriod, currentLevel, drillStack, selMode, selectedPeriods,
    setFocusedPeriod, setSelMode, setSelectedPeriods, setDrillStack, setSelDelConfirm,
    restorePeriodRef, drillInto, handleRangeDeletePreview,
  } = ctx

  useEffect(() => {
    if (selectedHour) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      const cols = GRID_COLS[currentLevel] ?? 4
      const idx = Math.max(0, periods.findIndex(p => p.period === focusedPeriod))
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.min(periods.length - 1, idx + 1)]?.period ?? null)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.max(0, idx - 1)]?.period ?? null)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.min(periods.length - 1, idx + cols)]?.period ?? null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.max(0, idx - cols)]?.period ?? null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cell = periods[idx]
        if (cell) drillInto(cell)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (selMode) {
          setSelMode(false)
          setSelectedPeriods(new Map())
        } else if (drillStack.length > 0) {
          restorePeriodRef.current = drillStack[drillStack.length - 1].label
          setDrillStack(prev => prev.slice(0, -1))
        }
      } else if (e.key === 'Backspace' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        if (currentLevel === 'hour' && drillStack.length > 0 && !selMode) {
          e.preventDefault()
          const dayEntry = drillStack[drillStack.length - 1]
          handleRangeDeletePreview(dayEntry.dateFrom, dayEntry.dateTo, drillStack.length - 2)
        }
      } else if (e.key === ' ' && (currentLevel === 'hour' || currentLevel === 'day')) {
        e.preventDefault()
        const cell = periods[idx]
        if (cell && cell.total_size_bytes > 0) {
          setSelMode(true)
          setSelectedPeriods(prev => {
            const next = new Map(prev)
            next.has(cell.period) ? next.delete(cell.period) : next.set(cell.period, cell)
            return next
          })
        }
      } else if (e.key === 'Delete' && selMode && selectedPeriods.size > 0 && currentLevel === 'hour') {
        e.preventDefault()
        setSelDelConfirm(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'a' && (currentLevel === 'hour' || currentLevel === 'day')) {
        e.preventDefault()
        setSelMode(true)
        setSelectedPeriods(new Map(periods.filter(p => p.total_size_bytes > 0).map(p => [p.period, p])))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedHour, periods, focusedPeriod, currentLevel, drillStack, selMode, selectedPeriods])
}
