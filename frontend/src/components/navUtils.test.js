// Rules: docs/code-map.md (navUtils.js) — heatmap drill-down date ranges must
// cover the whole period (incl. leap years), intensity maps sizes to buckets
// 0–9 where 0 is reserved for truly empty cells.
import { describe, expect, it } from 'vitest'
import { computeIntensity, dateRangeForPeriod, formatBytes } from './navUtils.js'

describe('dateRangeForPeriod', () => {
  it('year covers Jan 1 to Dec 31', () => {
    expect(dateRangeForPeriod('2024', 'year')).toEqual({
      dateFrom: '2024-01-01T00:00:00',
      dateTo: '2024-12-31T23:59:59',
    })
  })

  it('February in a leap year ends on the 29th', () => {
    expect(dateRangeForPeriod('2024-02', 'month').dateTo).toBe('2024-02-29T23:59:59')
    expect(dateRangeForPeriod('2023-02', 'month').dateTo).toBe('2023-02-28T23:59:59')
  })

  it('day covers the full 24 hours', () => {
    expect(dateRangeForPeriod('2024-11-16', 'day')).toEqual({
      dateFrom: '2024-11-16T00:00:00',
      dateTo: '2024-11-16T23:59:59',
    })
  })
})

describe('computeIntensity', () => {
  it('empty cell stays bucket 0, max cell gets bucket 9', () => {
    const out = computeIntensity([
      { total_size_bytes: 0 },
      { total_size_bytes: 50 },
      { total_size_bytes: 100 },
    ])
    expect(out.map(p => p.bucket)).toEqual([0, 5, 9]) // ceil(50/100×9)=5
  })

  it('any non-zero size gets at least bucket 1', () => {
    const out = computeIntensity([
      { total_size_bytes: 1 },
      { total_size_bytes: 1e9 },
    ])
    expect(out[0].bucket).toBeGreaterThanOrEqual(1)
  })

  it('all-zero periods do not divide by zero', () => {
    const out = computeIntensity([{ total_size_bytes: 0 }])
    expect(out[0].bucket).toBe(0)
  })
})

describe('formatBytes', () => {
  it('picks unit by magnitude', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(2e3)).toBe('2 KB')
    expect(formatBytes(5e6)).toBe('5 MB')
    expect(formatBytes(2e9)).toBe('2.0 GB')
  })
})
