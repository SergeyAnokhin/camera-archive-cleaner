import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortLabel(period, level) {
  if (level === 'month') return MONTH_NAMES[parseInt(period.split('-')[1], 10) - 1]
  if (level === 'day')   return period.split('-')[2]
  if (level === 'hour')  return `${period}h`
  return period
}

function readFontBase() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-base')) || 15
}

const customTooltipStyle = {
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#f1f5f9',
}

export default function StatsBar({ periods, level }) {
  const [fontBase, setFontBase] = useState(readFontBase)

  useEffect(() => {
    const handler = e => setFontBase(e.detail)
    document.addEventListener('font-base-change', handler)
    return () => document.removeEventListener('font-base-change', handler)
  }, [])

  if (!periods.length) return null

  const data = periods.map(p => ({
    name: shortLabel(p.period, level),
    gb: p.total_size_gb,
    photos: p.photo_count,
    videos: p.video_count,
  }))

  return (
    <div style={{ height: 160, padding: '0 4px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: fontBase * 0.8 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: fontBase * 0.73 }}
            axisLine={false}
            tickLine={false}
            unit=" GB"
            width={48}
          />
          <Tooltip
            contentStyle={{ ...customTooltipStyle, fontSize: fontBase * 0.87 }}
            formatter={(val, name) => name === 'gb' ? [`${val.toFixed(2)} GB`, 'Size'] : [val, name]}
            labelStyle={{ color: '#f1f5f9', marginBottom: 4 }}
          />
          <Bar dataKey="gb" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
