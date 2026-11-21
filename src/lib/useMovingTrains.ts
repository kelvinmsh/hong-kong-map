import { useEffect, useState } from 'react'
import { arrivalsFromEntry } from './mtr.ts'
import { advanceTrains, mergeSightings, sightingsAtStation, trainPoints, watchStations, type Motion } from './movingTrains.ts'
import { SIGHTING_KEEP_MS, TRAIN_MAX_AGE_MS } from './pacing.ts'
import { scheduleCache } from './scheduleCache.ts'

export function useMovingTrains(enabled: boolean) {
  const [points, setPoints] = useState<ReturnType<typeof trainPoints>>([])
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let trains: Motion[] = []
    let active = true
    let frame = 0
    let last = performance.now()
    let drawCarry = 0
    let pullCarry = 0
    const seen = new Map<string, number>()
    const jobs = watchStations()
    const release = jobs.map((job) => scheduleCache.hold(job.line, job.station, TRAIN_MAX_AGE_MS))

    const pull = () => {
      if (!active) return
      const now = Date.now()
      const before = trains.length
      let changed = false
      for (const job of jobs) {
        const entry = scheduleCache.peek(job.line, job.station)
        if (!entry?.ok || now - entry.at > SIGHTING_KEEP_MS) continue
        const key = `${job.line}:${job.station}`
        if (seen.get(key) === entry.at) continue
        const arrivals = arrivalsFromEntry(entry, job.line, job.station)
        if (!arrivals) continue
        seen.set(key, entry.at)
        trains = mergeSightings(trains, sightingsAtStation(job.line, job.station, arrivals, now), entry.at, now)
        changed = true
      }
      trains = trains.filter((train) => now - train.seenAt < SIGHTING_KEEP_MS)
      if (changed || trains.length !== before) setCount(trains.length)
    }

    const unsubscribe = scheduleCache.subscribe(pull)

    const draw = (now: number) => {
      const seconds = Math.min(0.5, (now - last) / 1000)
      last = now
      trains = advanceTrains(trains, seconds)
      drawCarry += seconds
      pullCarry += seconds
      if (pullCarry >= 1) {
        pullCarry = 0
        pull()
      }
      if (drawCarry >= 0.2) {
        drawCarry = 0
        setPoints(trainPoints(trains))
      }
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)

    return () => {
      active = false
      unsubscribe()
      for (const done of release) done()
      window.cancelAnimationFrame(frame)
    }
  }, [enabled])

  return { points, count }
}
