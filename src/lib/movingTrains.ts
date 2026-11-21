import { lineByCode, network, stationNames } from '../data/network.ts'
import { lineSpeed, placeOnTrack, pointAt, sampleStations, trackForDestination } from './along.ts'
import type { RawArrival } from './mtr.ts'
import { SIGHTING_KEEP_MS } from './pacing.ts'
import { parseHongKongTime } from './schedule.ts'

export type Sighting = {
  line: string
  direction: 'UP' | 'DOWN'
  dest: string
  distance: number
  speed: number
  path: number[][]
  length: number
  color: string
  label: string
}

export type Motion = Sighting & { id: string; seenAt: number }

export function watchStations() {
  const jobs: { line: string; station: string }[] = []
  for (const line of network.lines) {
    const main = line.paths.find((path) => path.kind === 'main')
    if (!main) continue
    const codes = [...sampleStations(main.codes)]
    const branch = line.paths.find((path) => path.kind === 'branch')
    const terminal = branch?.codes.at(-1)
    if (terminal && !codes.includes(terminal)) codes.push(terminal)
    for (const station of codes) jobs.push({ line: line.code, station })
  }
  return jobs
}

function minutesLeft(ttnt: number, currTime: string, now: number) {
  const stamped = parseHongKongTime(currTime)
  const ageMinutes = stamped == null ? 0 : (now - stamped) / 60_000
  return Math.max(0, ttnt - ageMinutes)
}

export function sightingsAtStation(
  lineCode: string,
  station: string,
  arrivals: { currTime: string; up: RawArrival[]; down: RawArrival[] },
  now: number,
): Sighting[] {
  const line = lineByCode(lineCode)
  if (!line) return []
  const sightings: Sighting[] = []
  const groups: ['UP' | 'DOWN', RawArrival[]][] = [
    ['UP', arrivals.up],
    ['DOWN', arrivals.down],
  ]
  for (const [direction, trains] of groups) {
    for (const train of trains) {
      const track = trackForDestination(lineCode, train.dest)
      const stationMeters = track?.stationMeters[station]
      if (!track || stationMeters == null || track.length <= 0) continue
      const speed = lineSpeed(lineCode, track.length)
      const distance = placeOnTrack(stationMeters, speed, minutesLeft(train.ttnt, arrivals.currTime, now), direction, track.length)
      sightings.push({
        line: lineCode,
        direction,
        dest: train.dest,
        distance,
        speed,
        path: track.coordinates,
        length: track.length,
        color: line.color,
        label: `${line.zh} 往${stationNames[train.dest] ?? train.dest}`,
      })
    }
  }
  return sightings
}

export function mergeSightings(current: Motion[], sightings: Sighting[], seenAt: number, now = seenAt): Motion[] {
  const next = current.map((train) => ({ ...train }))
  for (const sight of sightings) {
    const match = next.find(
      (train) =>
        train.line === sight.line &&
        train.dest === sight.dest &&
        train.direction === sight.direction &&
        Math.abs(train.distance - sight.distance) < 2500,
    )
    if (match) {
      match.distance = sight.distance
      match.speed = sight.speed
      match.path = sight.path
      match.length = sight.length
      match.color = sight.color
      match.label = sight.label
      match.seenAt = seenAt
    } else {
      next.push({
        ...sight,
        id: `${sight.line}-${sight.direction}-${sight.dest}-${Math.round(sight.distance)}`,
        seenAt,
      })
    }
  }
  return next.filter((train) => now - train.seenAt < SIGHTING_KEEP_MS)
}

export function advanceTrains(trains: Motion[], seconds: number): Motion[] {
  return trains.map((train) => {
    const sign = train.direction === 'UP' ? 1 : -1
    const distance = Math.min(train.length, Math.max(0, train.distance + sign * train.speed * seconds))
    return { ...train, distance }
  })
}

export type TrainMarker = ReturnType<typeof trainPoints>[number]

export function trainPoints(trains: Motion[]) {
  return trains.map((train) => {
    const point = pointAt(train.path, train.distance)
    return {
      id: train.id,
      line: train.line,
      color: train.color,
      label: train.label,
      coordinates: point,
    }
  })
}
