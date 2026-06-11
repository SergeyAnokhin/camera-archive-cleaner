import { useState, useRef } from 'react'
import { previewDeleteRange, confirmDelete } from '../api.js'

// Date-range delete flow: preview (photo + matched video list) → confirm.
// Drives DeleteConfirmModal in App.jsx; optionally drills back after deletion.
export function useRangeDelete({ cameraId, onDeleted, drillUpTo }) {
  const [preview, setPreview]               = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleteLoading, setDeleteLoading]   = useState(false)
  const [error, setError]                   = useState(null)
  const drillBack = useRef(null)

  async function handlePreview(dateFrom, dateTo, afterConfirmDrillTo) {
    setPreviewLoading(true)
    setError(null)
    drillBack.current = afterConfirmDrillTo
    try {
      const data = await previewDeleteRange(cameraId, dateFrom, dateTo)
      setPreview(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleConfirm() {
    const allIds = [
      ...preview.selected.map(f => f.id),
      ...preview.related_videos.map(f => f.id),
    ]
    setDeleteLoading(true)
    setError(null)
    try {
      await confirmDelete(allIds)
      setPreview(null)
      onDeleted()
      if (drillBack.current !== null) {
        drillUpTo(drillBack.current)
        drillBack.current = null
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  function handleCancel() {
    setPreview(null)
    setError(null)
  }

  return { preview, previewLoading, deleteLoading, error, handlePreview, handleConfirm, handleCancel }
}
