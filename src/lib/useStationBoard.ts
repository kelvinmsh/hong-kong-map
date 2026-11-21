import { useEffect, useRef, useState } from 'react'
import { lineByCode, stationNames } from '../data/network.ts'
import type { StationRecord } from '../data/types.ts'
import { toBoardLine, type BoardLine } from './mtr.ts'
import { BOARD_MAX_AGE_MS } from './pacing.ts'
import { scheduleCache } from './scheduleCache.ts'

function rateLine(station: StationRecord): BoardLine {
  return {
    line: station.lines[0] ?? '',
    state: 'rate',
    message: '查詢過於頻繁，請稍後再按重新整理。',
    url: '',
    delay: false,
    current: '',
    directions: [],
  }
}

export function useStationBoard(station: StationRecord | undefined) {
  const [board, setBoard] = useState<BoardLine[]>([])
  const [loading, setLoading] = useState(true)
  const reloadMark = useRef(0)
  const shown = useRef(station?.code)
  if (shown.current !== station?.code) {
    shown.current = station?.code
    setBoard([])
    setLoading(Boolean(station))
  }

  useEffect(() => {
    if (!station) return
    let active = true
    const release = station.lines.map((line) => scheduleCache.hold(line, station.code, BOARD_MAX_AGE_MS))
    const apply = () => {
      if (!active) return
      const now = Date.now()
      const pauseUntil = scheduleCache.pauseUntil()
      const rows = station.lines
        .map((code) => {
          const line = lineByCode(code)
          return toBoardLine(
            scheduleCache.peek(code, station.code),
            code,
            station.code,
            { up: line?.up ?? '上行', down: line?.down ?? '下行' },
            stationNames,
            now,
            pauseUntil,
          )
        })
        .filter((row): row is BoardLine => row != null)
      const waiting =
        pauseUntil <= now &&
        station.lines.some((line) => {
          const entry = scheduleCache.peek(line, station.code)
          if (!entry) return true
          return reloadMark.current > entry.attemptedAt
        })
      setBoard(rows.length === 0 && pauseUntil > now ? [rateLine(station)] : rows)
      setLoading(waiting)
    }
    const unsubscribe = scheduleCache.subscribe(apply)
    const timer = window.setTimeout(apply, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
      unsubscribe()
      for (const done of release) done()
    }
  }, [station])

  return {
    board,
    loading,
    reload: () => {
      if (!station) return
      const marked = station.lines.some((line) => scheduleCache.requestSoon(line, station.code))
      if (!marked) return
      reloadMark.current = Date.now()
      setLoading(true)
    },
  }
}
