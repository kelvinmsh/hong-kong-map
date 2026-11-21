import { describe, expect, it } from 'vitest'
import { network, railFeatures } from './network.ts'

function distance(start: number[], end: number[]) {
  const earth = 6_371_000
  const p1 = (start[1] * Math.PI) / 180
  const p2 = (end[1] * Math.PI) / 180
  const dp = ((end[1] - start[1]) * Math.PI) / 180
  const dl = ((end[0] - start[0]) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

describe('MTR network', () => {
  it('places every heavy-rail station, including the racecourse', () => {
    expect(network.stations).toHaveLength(98)
    expect(new Set(network.stations.map((station) => station.code)).size).toBe(98)
    const racecourse = network.stations.find((station) => station.code === 'RAC')
    expect(racecourse?.zh).toBe('馬場')
    expect(racecourse?.lines).toEqual(['EAL'])
  })

  it('keeps the racecourse off the main East Rail sequence', () => {
    const eastRail = network.lines.find((line) => line.code === 'EAL')
    const main = eastRail?.paths.find((path) => path.kind === 'main')
    const branch = eastRail?.paths.find((path) => path.kind === 'branch')
    const spur = eastRail?.paths.find((path) => path.kind === 'spur')
    expect(main?.codes.at(-1)).toBe('LOW')
    expect(main?.codes).not.toContain('RAC')
    expect(main?.codes).not.toContain('LMC')
    expect(main?.codes[main.codes.indexOf('FOT') + 1]).toBe('UNI')
    expect(branch?.codes).toEqual(['SHS', 'LMC'])
    expect(spur?.coordinates).toHaveLength(2)
  })

  it('splits the Tseung Kwan O line toward LOHAS Park', () => {
    const line = network.lines.find((item) => item.code === 'TKL')
    expect(line?.paths.find((path) => path.kind === 'branch')?.codes).toEqual(['TKO', 'LHP'])
    expect(line?.paths.find((path) => path.kind === 'main')?.codes).not.toContain('LHP')
  })

  it('keeps Island Line station spacing within a city block range', () => {
    const line = network.lines.find((item) => item.code === 'ISL')
    const coordinates = line?.paths[0]?.coordinates ?? []
    expect(coordinates).toHaveLength(17)
    for (let index = 1; index < coordinates.length; index += 1) {
      const metres = distance(coordinates[index - 1], coordinates[index])
      expect(metres).toBeGreaterThan(400)
      expect(metres).toBeLessThan(2000)
    }
  })

  it('draws a solid path for every line and one racecourse spur', () => {
    expect(network.lines).toHaveLength(10)
    expect(railFeatures(false).length).toBeGreaterThanOrEqual(10)
    expect(railFeatures(true)).toHaveLength(1)
  })
})