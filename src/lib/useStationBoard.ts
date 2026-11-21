import { useCallback, useEffect, useRef, useState } from 'react'
import { lineByCode, stationNames } from '../data/network.ts'
import type { StationRecord } from '../data/types.ts'
import { loadLine, type BoardLine } from './mtr.ts'

export function useStationBoard(station: StationRecord | undefined) {
  const [board, setBoard] = useState<BoardLine[]>([])
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)

  const load = useCallback(async (current: StationRecord) => {
    const id = generation.current + 1
    generation.current = id
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
  }, [])

  useEffect(() => {
    if (!station) return
    void load(station)
    const timer = window.setInterval(() => {
      setLoading(true)
      void load(station)
    }, 15_000)
    return () => {
      generation.current += 1
      window.clearInterval(timer)
    }
  }, [load, station])

  return {
    board,
    loading,
    reload: () => {
      if (!station) return
      setLoading(true)
      void load(station)
    },
  }
}
