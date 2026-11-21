import { useCallback, useEffect, useRef, useState } from 'react'
import { lineByCode, stationNames } from '../data/network.ts'
import type { StationRecord } from '../data/types.ts'
import { loadLine, type BoardLine } from './mtr.ts'

export function useStationBoard(station: StationRecord | undefined) {
  const [board, setBoard] = useState<BoardLine[]>([])
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const tail = useRef(Promise.resolve())

  const load = useCallback((current: StationRecord, announce: boolean) => {
    const id = generation.current
    const run = tail.current.then(async () => {
      if (generation.current !== id) return
      if (announce) setLoading(true)
      try {
        const rows = await Promise.all(
          current.lines.map((code) => {
            const line = lineByCode(code)
            return loadLine(code, current.code, { up: line?.up ?? '上行', down: line?.down ?? '下行' }, stationNames)
          }),
        )
        if (generation.current === id) setBoard(rows)
      } finally {
        if (generation.current === id) setLoading(false)
      }
    })
    tail.current = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }, [])

  useEffect(() => {
    if (!station) return
    let active = true
    let timer = 0
    const refresh = () => {
      void load(station, false).then(() => {
        if (!active) return
        timer = window.setTimeout(refresh, 15_000)
      })
    }
    refresh()
    return () => {
      active = false
      generation.current += 1
      window.clearTimeout(timer)
    }
  }, [load, station])

  return {
    board,
    loading,
    reload: () => {
      if (!station) return
      void load(station, true)
    },
  }
}
