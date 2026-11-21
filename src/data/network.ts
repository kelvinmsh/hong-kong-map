import data from './network.json'
import type { LineRecord, NetworkFile, StationRecord } from './types.ts'

export const network = data as NetworkFile

const stationIndex = new Map(network.stations.map((station) => [station.code, station]))
const lineIndex = new Map(network.lines.map((line) => [line.code, line]))

export function stationByCode(code: string): StationRecord | undefined {
  return stationIndex.get(code)
}

export function lineByCode(code: string): LineRecord | undefined {
  return lineIndex.get(code)
}

export const stationNames: Record<string, string> = Object.fromEntries(
  network.stations.map((station) => [station.code, station.zh]),
)

export type RailFeature = {
  type: 'Feature'
  properties: { code: string; zh: string; color: string; offset: number }
  geometry: { type: 'LineString'; coordinates: number[][] }
}

export function railFeatures(spur: boolean): RailFeature[] {
  const features: RailFeature[] = []
  for (const line of network.lines) {
    for (const path of line.paths) {
      const isSpur = path.kind === 'spur'
      if (isSpur !== spur) continue
      features.push({
        type: 'Feature',
        properties: { code: line.code, zh: line.zh, color: line.color, offset: line.offset },
        geometry: { type: 'LineString', coordinates: path.coordinates },
      })
    }
  }
  return features
}

export type StationFeature = {
  type: 'Feature'
  properties: { code: string; zh: string }
  geometry: { type: 'Point'; coordinates: [number, number] }
}

export function stationFeatures(): StationFeature[] {
  return network.stations.map((station) => ({
    type: 'Feature',
    properties: { code: station.code, zh: station.zh },
    geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
  }))
}
