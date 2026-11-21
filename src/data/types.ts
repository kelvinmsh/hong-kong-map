export type PathKind = 'main' | 'branch' | 'spur'

export type LinePath = {
  kind: PathKind
  codes: string[]
  coordinates: number[][]
}

export type LineRecord = {
  code: string
  zh: string
  color: string
  offset: number
  up: string
  down: string
  paths: LinePath[]
}

export type StationRecord = {
  code: string
  zh: string
  en: string
  lat: number
  lon: number
  lines: string[]
}

export type NetworkFile = {
  generatedAt: string
  sources: { routes: string; venues: string }
  lines: LineRecord[]
  stations: StationRecord[]
}
