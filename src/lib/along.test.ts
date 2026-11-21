import { describe, expect, it } from 'vitest'
import { measureTrack, placeOnTrack, pointAt, sampleStations } from './along.ts'

describe('track position', () => {
  const coordinates = [
    [114, 22],
    [114.01, 22],
    [114.02, 22],
  ]

  it('places an approaching up train behind the station', () => {
    const track = measureTrack(coordinates, [])
    const distance = placeOnTrack(track.length, track.length / 120, 1, 'UP', track.length)
    expect(distance).toBeLessThan(track.length)
    expect(distance).toBeGreaterThan(0)
  })

  it('returns the track ends', () => {
    expect(pointAt(coordinates, 0)).toEqual(coordinates[0])
    const end = pointAt(coordinates, 1_000_000)
    expect(end[0]).toBeCloseTo(114.02)
    expect(end[1]).toBeCloseTo(22)
  })

  it('samples both ends of a long line', () => {
    const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    expect(sampleStations(codes)[0]).toBe('A')
    expect(sampleStations(codes).at(-1)).toBe('G')
    expect(sampleStations(['A', 'B'])).toEqual(['A', 'B'])
  })
})
