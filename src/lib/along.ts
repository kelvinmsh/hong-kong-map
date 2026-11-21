import { lineByCode, stationByCode } from '../data/network.ts'
import type { LinePath } from '../data/types.ts'

export function haversine(a: number[], b: number[]) {
  const earth = 6371000
  const p1 = (a[1] * Math.PI) / 180
  const p2 = (b[1] * Math.PI) / 180
  const dp = ((b[1] - a[1]) * Math.PI) / 180
  const dl = ((b[0] - a[0]) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

export type MeasuredTrack = {
  coordinates: number[][]
  length: number
  stationMeters: Record<string, number>
}

export function measureTrack(coordinates: number[][], codes: string[]): MeasuredTrack {
  const cumulative = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const current = coordinates[index]
    if (!previous || !current) continue
    cumulative.push((cumulative.at(-1) ?? 0) + haversine(previous, current))
  }
  const stationMeters: Record<string, number> = {}
  let cursor = 0
  for (const code of codes) {
    const station = stationByCode(code)
    if (!station) continue
    let best = cursor
    let bestDistance = Infinity
    for (let index = cursor; index < coordinates.length; index += 1) {
      const point = coordinates[index]
      if (!point) continue
      const distance = haversine(point, [station.lon, station.lat])
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    }
    stationMeters[code] = cumulative[best] ?? 0
    cursor = best
  }
  return { coordinates, length: cumulative.at(-1) ?? 0, stationMeters }
}

export function pointAt(coordinates: number[][], distance: number): number[] {
  const first = coordinates[0]
  if (!first) return [0, 0]
  if (distance <= 0) return first
  let walked = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const current = coordinates[index]
    if (!previous || !current) continue
    const step = haversine(previous, current)
    if (walked + step >= distance) {
      const ratio = step === 0 ? 0 : (distance - walked) / step
      return [previous[0] + (current[0] - previous[0]) * ratio, previous[1] + (current[1] - previous[1]) * ratio]
    }
    walked += step
  }
  return coordinates.at(-1) ?? first
}

function spliceBranch(main: LinePath, branch: LinePath, join: string): { coordinates: number[][]; codes: string[] } {
  const joinStation = stationByCode(join)
  let cut = 0
  if (joinStation) {
    let best = Infinity
    main.coordinates.forEach((point, index) => {
      const distance = haversine(point, [joinStation.lon, joinStation.lat])
      if (distance < best) {
        best = distance
        cut = index
      }
    })
  }
  const joinIndex = main.codes.indexOf(join)
  return {
    coordinates: main.coordinates.slice(0, cut + 1).concat(branch.coordinates),
    codes: [...main.codes.slice(0, joinIndex + 1), ...branch.codes.filter((code) => code !== join)],
  }
}

export function trackForDestination(lineCode: string, dest: string): MeasuredTrack | null {
  const line = lineByCode(lineCode)
  const main = line?.paths.find((path) => path.kind === 'main')
  if (!line || !main) return null
  const branch = line.paths.find((path) => path.kind === 'branch')
  if (branch && ((lineCode === 'EAL' && dest === 'LMC') || (lineCode === 'TKL' && dest === 'LHP'))) {
    const join = lineCode === 'EAL' ? 'SHS' : 'TKO'
    const joined = spliceBranch(main, branch, join)
    return measureTrack(joined.coordinates, joined.codes)
  }
  return measureTrack(main.coordinates, main.codes)
}

const RUNTIME_MINUTES: Record<string, number> = {
  ISL: 34,
  TWL: 30,
  KTL: 35,
  TKL: 16,
  SIL: 11,
  EAL: 48,
  TML: 75,
  TCL: 27,
  AEL: 24,
  DRL: 5,
}

export function lineSpeed(lineCode: string, length: number) {
  const minutes = RUNTIME_MINUTES[lineCode] ?? 30
  return length / (minutes * 60)
}

export function sampleStations(codes: string[]) {
  if (codes.length <= 4) return [...codes]
  const last = codes.length - 1
  const indexes = [0, Math.round(last / 3), Math.round((last * 2) / 3), last]
  return [...new Set(indexes.map((index) => codes[index] ?? ''))].filter(Boolean)
}

export function placeOnTrack(stationMeters: number, speed: number, ttntMinutes: number, direction: 'UP' | 'DOWN', length: number) {
  const remaining = Math.max(0, ttntMinutes) * 60 * speed
  const raw = direction === 'UP' ? stationMeters - remaining : stationMeters + remaining
  return Math.min(length, Math.max(0, raw))
}
