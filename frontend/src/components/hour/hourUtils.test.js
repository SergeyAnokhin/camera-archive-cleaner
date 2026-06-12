// Rule: docs/settings.md "Distribution uniformity settings" —
//   AF = nActive/60 × 100, SE = H/log2(60) × 100, BC = active 5-min blocks/12 × 100,
//   Combined = 0.40×AF + 0.35×SE + 0.25×BC; default thresholds per metric.
// 0 = one concentrated event, 100 = recording every minute.
import { beforeEach, describe, expect, it } from 'vitest'
import { computeUniformity, getMetricThresholds } from './hourUtils.js'

function buckets(counts) {
  return counts.map(c => ({ total_count: c }))
}

beforeEach(() => localStorage.clear())

describe('computeUniformity', () => {
  it('returns null for empty or all-zero buckets', () => {
    expect(computeUniformity([])).toBe(null)
    expect(computeUniformity(null)).toBe(null)
    expect(computeUniformity(buckets(Array(60).fill(0)))).toBe(null)
  })

  it('recording every minute → all metrics 100, alert level', () => {
    const r = computeUniformity(buckets(Array(60).fill(1)))
    expect(r.activeFraction).toBe(100)
    expect(r.normalizedEntropy).toBe(100)
    expect(r.blockCoverage).toBe(100)
    expect(r.score).toBe(100)
    expect(r.level).toBe('alert') // 100 ≥ combined alert default 72
  })

  it('one concentrated event → low scores, no level', () => {
    const counts = Array(60).fill(0)
    counts[17] = 10 // single burst in one minute
    const r = computeUniformity(buckets(counts))
    expect(r.activeFraction).toBe(2)    // round(1/60×100)
    expect(r.normalizedEntropy).toBe(0) // single bucket → zero entropy
    expect(r.blockCoverage).toBe(8)     // round(1/12×100)
    expect(r.level).toBe(null)
  })

  it('SE follows the Shannon entropy formula', () => {
    const counts = Array(60).fill(0)
    counts[0] = 5
    counts[30] = 5 // two equal buckets → H = 1 bit
    const r = computeUniformity(buckets(counts))
    expect(r.normalizedEntropy).toBe(Math.round((1 / Math.log2(60)) * 100)) // 17
  })

  it('combined score uses the documented 0.40/0.35/0.25 weights', () => {
    const counts = Array(60).fill(0)
    for (let i = 0; i < 30; i++) counts[i] = 1 // first half active
    const r = computeUniformity(buckets(counts))
    const expected = Math.round(
      0.40 * r.activeFraction + 0.35 * r.normalizedEntropy + 0.25 * r.blockCoverage,
    )
    expect(r.score).toBe(expected)
  })

  it('BC counts 5-minute blocks with at least one recording', () => {
    const counts = Array(60).fill(0)
    counts[0] = 1   // block 0
    counts[7] = 1   // block 1
    counts[59] = 1  // block 11
    const r = computeUniformity(buckets(counts))
    expect(r.blockCoverage).toBe(Math.round((3 / 12) * 100)) // 25
  })
})

describe('getMetricThresholds', () => {
  it('defaults match docs/settings.md', () => {
    expect(getMetricThresholds('af')).toEqual({ warn: 40, alert: 65 })
    expect(getMetricThresholds('se')).toEqual({ warn: 55, alert: 80 })
    expect(getMetricThresholds('bc')).toEqual({ warn: 40, alert: 65 })
    expect(getMetricThresholds('combined')).toEqual({ warn: 50, alert: 72 })
  })

  it('localStorage overrides take effect', () => {
    localStorage.setItem('uniformity_af_warn', '30')
    expect(getMetricThresholds('af').warn).toBe(30)
  })
})
