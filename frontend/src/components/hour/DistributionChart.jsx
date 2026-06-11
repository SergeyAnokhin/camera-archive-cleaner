import { useState, useRef, useMemo } from 'react'
import { formatBytes, computeUniformity } from './hourUtils.js'
import './DistributionChart.css'

// 60 bars (1 per minute), stacked photo/video by size. Click jumps to the matching page.
export default function DistributionChart({ buckets, pageSize, page, total, onGoToPage, hourStats }) {
  const chartRef   = useRef(null)
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const maxSize    = useMemo(() => Math.max(...buckets.map(b => b.total_size_bytes ?? 0), 1), [buckets])
  const uniformity = useMemo(() => computeUniformity(buckets), [buckets])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const cumulative = useMemo(() => {
    const result = [0]
    for (const b of buckets) result.push(result[result.length - 1] + b.total_count)
    return result
  }, [buckets])

  const pageStart = (page - 1) * pageSize
  const pageEnd   = page * pageSize - 1
  let firstActive = -1, lastActive = -1
  buckets.forEach((b, i) => {
    if (b.total_count === 0) return
    const bStart = cumulative[i], bEnd = cumulative[i] + b.total_count - 1
    if (bEnd >= pageStart && bStart <= pageEnd) {
      if (firstActive < 0) firstActive = i
      lastActive = i
    }
  })

  const highlightStyle = firstActive >= 0 ? {
    left:  `${(firstActive / 60) * 100}%`,
    width: `${((lastActive - firstActive + 1) / 60) * 100}%`,
  } : null

  function handleClick(e) {
    if (!chartRef.current) return
    const rect = chartRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    let idx    = Math.floor(frac * 60)
    if (buckets[idx]?.total_count === 0) {
      let found = false
      for (let d = 1; d < 60 && !found; d++) {
        if (idx + d < 60 && buckets[idx + d]?.total_count > 0) { idx = idx + d; found = true }
        else if (idx - d >= 0 && buckets[idx - d]?.total_count > 0) { idx = idx - d; found = true }
      }
      if (!found) return
    }
    onGoToPage(Math.floor(cumulative[idx] / pageSize) + 1)
  }

  const hovered = hoveredIdx !== null ? buckets[hoveredIdx] : null

  return (
    <div className="hv-dist-root">
      <div className="hv-dist-header">
        <span className="hv-dist-title">
          <i className="mdi mdi-chart-bar" /> Distribution per minute
        </span>
        {hourStats && (
          <span className="hv-dist-hourstat">
            <span><i className="mdi mdi-image-outline" /> {hourStats.photo_count.toLocaleString()}</span>
            <span className="hv-dist-stat-sep">·</span>
            <span><i className="mdi mdi-video-outline" /> {hourStats.video_count.toLocaleString()}</span>
            <span className="hv-dist-stat-sep">·</span>
            <span>{formatBytes(hourStats.total_size_bytes)}</span>
          </span>
        )}
        {uniformity && (
          <div className="hv-dist-uniformity-group">
            {[
              { key: 'active',  label: 'AF', score: uniformity.activeFraction,    tip: 'Active Fraction: share of the 60 minutes with recordings' },
              { key: 'entropy', label: 'SE', score: uniformity.normalizedEntropy, tip: 'Shannon Entropy: how evenly the load is spread' },
              { key: 'bc',      label: 'BC', score: uniformity.blockCoverage,     tip: 'Block Coverage: how many of the 12 five-minute blocks are active' },
            ].map(({ key, label, score, tip }) => {
              const lvl = uniformity.levelByMethod[key]
              const icon = lvl === 'alert' ? 'mdi-alert-circle-outline'
                         : lvl === 'warn'  ? 'mdi-alert-outline'
                         :                   'mdi-check-circle-outline'
              return (
                <span
                  key={key}
                  className={`hv-dist-uniformity-badge hv-dist-uniformity-${lvl ?? 'ok'}`}
                  title={`${label}: ${score}/100 — ${tip}\n${lvl === 'alert' ? 'False triggers (rain?)' : lvl === 'warn' ? 'Suspiciously uniform (wind?)' : 'Normal'}`}
                >
                  <i className={`mdi ${icon}`} />{label} {score}
                </span>
              )
            })}
          </div>
        )}
        <span className="hv-dist-hint">click to jump</span>
      </div>
      <div className="hv-dist-chart" ref={chartRef} onClick={handleClick}>
        {highlightStyle && <div className="hv-dist-highlight" style={highlightStyle} />}

        {/* Hover tooltip */}
        {hovered && hovered.total_count > 0 && (
          <div
            className="hv-dist-tooltip"
            style={{ left: `${Math.min(Math.max(((hoveredIdx + 0.5) / 60) * 100, 5), 87)}%` }}
          >
            <div className="hv-dist-tooltip-time">:{String(hoveredIdx).padStart(2, '0')}</div>
            {hovered.photo_count > 0 && (
              <div><i className="mdi mdi-image-outline" /> {hovered.photo_count} · {formatBytes(hovered.photo_size_bytes)}</div>
            )}
            {hovered.video_count > 0 && (
              <div><i className="mdi mdi-video-outline" /> {hovered.video_count} · {formatBytes(hovered.video_size_bytes)}</div>
            )}
          </div>
        )}

        {buckets.map((b, i) => {
          const showLabel = i % 15 === 0
          const hPct = b.total_size_bytes > 0 ? Math.max((b.total_size_bytes / maxSize) * 100, 4) : 0
          const videoPct = b.total_size_bytes > 0 ? ((b.video_size_bytes ?? 0) / b.total_size_bytes) * 100 : 0
          return (
            <div
              key={i}
              className={`hv-dist-col${b.total_count === 0 ? ' empty' : ''}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="hv-dist-bar-wrap">
                {b.total_size_bytes > 0 && (
                  <div className="hv-dist-bar" style={{ height: `${hPct}%` }}>
                    <div className="hv-dist-bar-video" style={{ height: `${videoPct}%` }} />
                    <div className="hv-dist-bar-photo" />
                  </div>
                )}
              </div>
              <div className="hv-dist-label">{showLabel ? `:${String(i).padStart(2,'0')}` : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
