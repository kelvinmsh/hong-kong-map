import { BOARD_MAX_AGE_MS, SIGHTING_KEEP_MS } from './pacing.ts'
import {
  displayTrain,
  publicMessage,
  readPayload,
  type DisplayTrain,
  type LiveTrain,
} from './schedule.ts'

export type BoardDirection = {
  id: 'UP' | 'DOWN'
  title: string
  trains: DisplayTrain[]
  empty: boolean
}

export type BoardLine = {
  line: string
  state: 'ready' | 'rate' | 'error'
  message: string
  url: string
  delay: boolean
  current: string
  directions: BoardDirection[]
}

export type RawArrival = { dest: string; ttnt: number }

export type CachedSchedule = {
  at: number
  ok: boolean
  body: unknown
  error: 'rate' | 'http' | 'network' | null
}

function failed(line: string, state: 'rate' | 'error', message: string): BoardLine {
  return { line, state, message, url: '', delay: false, current: '', directions: [] }
}

function showTrains(rows: LiveTrain[], current: string, names: Record<string, string>, now: number): DisplayTrain[] {
  return [...rows]
    .sort((left, right) => Number(left.seq) - Number(right.seq))
    .map((row) => displayTrain(row, current, names, now))
}

function direction(
  id: 'UP' | 'DOWN',
  title: string,
  rows: LiveTrain[],
  current: string,
  names: Record<string, string>,
  now: number,
): BoardDirection {
  return { id, title, trains: showTrains(rows, current, names, now), empty: rows.length === 0 }
}

function arrivals(trains: LiveTrain[]): RawArrival[] {
  return trains
    .filter((train) => train.valid !== 'N' && train.dest && Number.isFinite(Number(train.ttnt)))
    .map((train) => ({ dest: train.dest, ttnt: Number(train.ttnt) }))
}

export function arrivalsFromEntry(entry: CachedSchedule | null, line: string, station: string) {
  if (!entry?.ok) return null
  const payload = readPayload(entry.body, line, station)
  return {
    currTime: payload.block?.currTime ?? '',
    up: arrivals(payload.block?.up ?? []),
    down: arrivals(payload.block?.down ?? []),
  }
}

export function toBoardLine(
  entry: CachedSchedule | null,
  line: string,
  station: string,
  titles: { up: string; down: string },
  names: Record<string, string>,
  now: number,
  pauseUntil: number,
): BoardLine | null {
  if (!entry) return null
  const agedOut = entry.ok && now - entry.at > SIGHTING_KEEP_MS
  if (agedOut && now >= pauseUntil) return null
  if (!entry.ok || entry.body == null) {
    if (entry.error === 'rate') return failed(line, 'rate', '查詢過於頻繁，請稍後再按重新整理。')
    return failed(line, 'error', '這條綫的班次暫時未能讀取。')
  }
  const payload = readPayload(entry.body, line, station)
  const current = payload.block?.currTime ?? ''
  const paused = now < pauseUntil && now - entry.at > BOARD_MAX_AGE_MS
  const message = [paused ? '查詢過於頻繁，先顯示剛才的班次。' : '', publicMessage(payload.status, payload.message)]
    .filter(Boolean)
    .join(' ')
  return {
    line,
    state: 'ready',
    message,
    url: payload.url,
    delay: payload.delay,
    current,
    directions: [
      direction('UP', titles.up, payload.block?.up ?? [], current, names, now),
      direction('DOWN', titles.down, payload.block?.down ?? [], current, names, now),
    ],
  }
}
