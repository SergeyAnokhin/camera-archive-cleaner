import { useState } from 'react'
import { previewDelete, confirmDelete, previewDeleteRange } from '../../api.js'
import { formatBytes } from './hourUtils.js'

/**
 * All delete handling for the hour viewer, kept out of the main component.
 * Covers two flows:
 *   - per-file / whole-page delete (preview → confirm, with ±5 s video matching)
 *   - whole-hour delete (preview_range → confirm)
 *
 * `ctx` carries the data and callbacks owned by HourViewer:
 *   cameraId, dateFrom, dateTo, files, selectedIds — what to delete
 *   onBack, onFilesDeleted                        — navigation / parent refresh
 *   onClearSelection                              — exit selection mode after a confirm
 *   onRefresh                                     — bump HourViewer's data-reload key
 */
export function useHourDelete(ctx) {
  const {
    cameraId, dateFrom, dateTo, files, selectedIds,
    onBack, onFilesDeleted, onClearSelection, onRefresh,
  } = ctx

  const [preview, setPreview]               = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleteLoading, setDeleteLoading]   = useState(false)
  const [deleteError, setDeleteError]       = useState(null)
  const [deleteSuccess, setDeleteSuccess]   = useState(null)
  const [hourPreview, setHourPreview]               = useState(null)
  const [hourPreviewLoading, setHourPreviewLoading] = useState(false)
  const [hourDeleteLoading, setHourDeleteLoading]   = useState(false)
  const [hourDeleteError, setHourDeleteError]       = useState(null)

  function resetMessages() {
    setDeleteError(null)
    setDeleteSuccess(null)
  }

  async function handleDeletePreview() {
    if (selectedIds.size === 0) return
    setPreviewLoading(true)
    resetMessages()
    try {
      setPreview(await previewDelete([...selectedIds]))
    } catch (e) {
      setDeleteError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDeleteAll() {
    if (files.length === 0) return
    setPreviewLoading(true)
    resetMessages()
    try {
      setPreview(await previewDelete(files.map(f => f.id)))
    } catch (e) {
      setDeleteError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDeleteConfirm() {
    const allIds = [
      ...preview.selected.map(f => f.id),
      ...preview.related_videos.map(f => f.id),
    ]
    setDeleteLoading(true)
    resetMessages()
    try {
      const allPreviewFiles = [...preview.selected, ...preview.related_videos]
      const firstName = allPreviewFiles[0]?.file_path?.split(/[\\/]/).pop()
      const extraCount = allPreviewFiles.length - 1

      const res = await confirmDelete(allIds)
      setPreview(null)
      onClearSelection?.()

      const parts = []
      if (res.photo_count) parts.push(`${res.photo_count} photo${res.photo_count !== 1 ? 's' : ''}`)
      if (res.video_count) parts.push(`${res.video_count} video${res.video_count !== 1 ? 's' : ''}`)
      const fileSummary = parts.length ? parts.join(' + ') : `${res.deleted.length} files`
      const thumbPart = res.thumbnails_deleted ? ` · ${res.thumbnails_deleted} thumbnail${res.thumbnails_deleted !== 1 ? 's' : ''} removed` : ''
      const freedPart = res.freed_bytes > 0 ? ` · freed ${formatBytes(res.freed_bytes)}` : ''
      const fileHint = firstName ? ` — ${firstName}${extraCount > 0 ? ` +${extraCount}` : ''}` : ''

      if (res.failed?.length > 0) {
        setDeleteError(`Deleted ${fileSummary}${thumbPart}${freedPart}${fileHint}. ${res.failed.length} could not be removed from disk.`)
      } else {
        setDeleteSuccess(`Deleted ${fileSummary}${thumbPart}${freedPart}${fileHint}`)
      }
      onRefresh?.()
      onFilesDeleted?.()
    } catch (e) {
      setDeleteError(e.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleDeleteHourPreview() {
    setHourPreviewLoading(true)
    setHourDeleteError(null)
    try {
      setHourPreview(await previewDeleteRange(cameraId, dateFrom, dateTo))
    } catch (e) {
      setHourDeleteError(e.message)
    } finally {
      setHourPreviewLoading(false)
    }
  }

  async function handleDeleteHourConfirm() {
    const allIds = [
      ...hourPreview.selected.map(f => f.id),
      ...hourPreview.related_videos.map(f => f.id),
    ]
    setHourDeleteLoading(true)
    setHourDeleteError(null)
    try {
      await confirmDelete(allIds)
      setHourPreview(null)
      onFilesDeleted?.()
      onBack()
    } catch (e) {
      setHourDeleteError(e.message)
    } finally {
      setHourDeleteLoading(false)
    }
  }

  function cancelPreview() {
    setPreview(null)
    resetMessages()
  }

  function cancelHourPreview() {
    setHourPreview(null)
    setHourDeleteError(null)
  }

  return {
    preview, previewLoading, deleteLoading, deleteError, deleteSuccess,
    hourPreview, hourPreviewLoading, hourDeleteLoading, hourDeleteError,
    handleDeletePreview, handleDeleteAll, handleDeleteConfirm,
    handleDeleteHourPreview, handleDeleteHourConfirm,
    resetMessages, cancelPreview, cancelHourPreview,
  }
}
