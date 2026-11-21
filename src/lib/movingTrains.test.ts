import { describe, expect, it } from 'vitest'
import { mergeSightings, watchStations, type Sighting } from './movingTrains.ts'
import { SIGHTING_KEEP_MS } from './pacing.ts'

const sighting: Sighting = {
  line: 'ISL',
  direction: 'UP',
  dest: 'CHW',
  distance: 100,
  speed: 10,
  path: [
    [114.1, 22.2],
    [114.2, 22.3],
  ],
  length: 1000,
  color: '#000',
  label: '測試',
}

describe('moving trains', () => {
  it('samples the network instead of asking for every station', () => {
    const jobs = watchStations()
    expect(jobs.length).toBeGreaterThan(10)
    expect(jobs.length).toBeLessThanOrEqual(48)
    expect(new Set(jobs.map((job) => `${job.line}:${job.station}`)).size).toBe(jobs.length)
  })

  it('drops a train once its schedule sample is too old to trust', () => {
    expect(mergeSightings([], [sighting], 1_000, 1_000 + SIGHTING_KEEP_MS - 1)).toHaveLength(1)
    expect(mergeSightings([], [sighting], 1_000, 1_000 + SIGHTING_KEEP_MS + 1)).toEqual([])
  })
})