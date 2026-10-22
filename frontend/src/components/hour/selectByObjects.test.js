// Rule: docs/hour-selection.md "Select without objects" —
//   photo selected only if analysed and free of target objects (unanalysed ≠ empty);
//   video follows the photos within ±30 s: selected only if ≥1 photo is near and all are analysed + clear;
//   videos near an open page edge are skipped.
import { describe, expect, it } from 'vitest'
import { selectFilesWithoutObjects } from './selectByObjects.js'

const PERSON = 0, CAT = 15
let seq = 0
function file(type, sec) {
  const id = ++seq
  return { id, file_type: type, timestamp: new Date(Date.UTC(2024, 0, 1, 12, 0, sec)).toISOString() }
}
function aiMap(entries) {
  return new Map(Object.entries(entries).map(([id, objects]) => [Number(id), { detection: objects === null ? null : { objects } }]))
}

describe('selectFilesWithoutObjects — photos', () => {
  it('selects analysed photos without the target, skips hits and unanalysed ones', () => {
    const empty = file('photo', 0), person = file('photo', 10), cat = file('photo', 20), unknown = file('photo', 30)
    const map = aiMap({ [empty.id]: '', [person.id]: 'person', [cat.id]: 'cat' })
    const r = selectFilesWithoutObjects([empty, person, cat, unknown], map, [PERSON])
    expect(r.ids).toEqual([empty.id, cat.id])
    expect(r.unanalyzedPhotos).toBe(1)
  })

  it('empty class list = any object counts as a hit', () => {
    const empty = file('photo', 0), cat = file('photo', 10)
    const map = aiMap({ [empty.id]: '', [cat.id]: 'cat' })
    expect(selectFilesWithoutObjects([empty, cat], map, []).ids).toEqual([empty.id])
  })

  it('matches Russian class names and multi-word classes', () => {
    const a = file('photo', 0), b = file('photo', 10)
    const map = aiMap({ [a.id]: 'человек', [b.id]: 'traffic light' })
    expect(selectFilesWithoutObjects([a, b], map, [PERSON, 9]).ids).toEqual([])
    expect(selectFilesWithoutObjects([a, b], map, [CAT]).ids).toEqual([a.id, b.id])
  })
})

describe('selectFilesWithoutObjects — videos', () => {
  it('video follows its photos: kept when a photo within the window has the target', () => {
    const p1 = file('photo', 0), p2 = file('photo', 20), v = file('video', 10)
    const map = aiMap({ [p1.id]: '', [p2.id]: 'person' })
    expect(selectFilesWithoutObjects([p1, v, p2], map, [PERSON]).ids).toEqual([p1.id])
  })

  it('video selected when all nearby photos are clear', () => {
    const p1 = file('photo', 0), v = file('video', 5), p2 = file('photo', 10)
    const map = aiMap({ [p1.id]: '', [p2.id]: 'cat' })
    expect(selectFilesWithoutObjects([p1, v, p2], map, [PERSON]).ids).toEqual([p1.id, v.id, p2.id])
  })

  it('video skipped with no photo near, or a nearby photo not analysed', () => {
    const far = file('photo', 0), v = file('video', 300)
    expect(selectFilesWithoutObjects([far, v], aiMap({ [far.id]: '' }), [PERSON]).ids).toEqual([far.id])
    const near = file('photo', 305)
    expect(selectFilesWithoutObjects([far, v, near], aiMap({ [far.id]: '' }), [PERSON]).ids).toEqual([far.id])
  })

  it('video within the window of an open page edge is skipped', () => {
    const p = file('photo', 0), v = file('video', 20), p2 = file('photo', 40)
    const map = aiMap({ [p.id]: '', [p2.id]: '' })
    const files = [p, v, p2]
    expect(selectFilesWithoutObjects(files, map, [PERSON]).ids).toEqual([p.id, v.id, p2.id])
    expect(selectFilesWithoutObjects(files, map, [PERSON], { hasNextPage: true }).ids).toEqual([p.id, p2.id])
    expect(selectFilesWithoutObjects(files, map, [PERSON], { hasPrevPage: true }).ids).toEqual([p.id, p2.id])
  })
})
