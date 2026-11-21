import { useEffect, useState } from 'react'
import { fetchArrivals } from './mtr.ts'
import { advanceTrains, mergeSightings, sightingsAtStation, trainPoints, watchStations, type Motion } from './movingTrains.ts'

const GAP_MS = 800

export function useMovingTrains(enabled: boolean) {
  const [points, setPoints] = useState<ReturnType<typeof trainPoints>>([])
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let trains: Motion[] = []
    let active = true
    let timer = 0
    let frame = 0
    let last = performance.now()
    let carry = 0
    const jobs = watchStations()
    let cursor = 0

    const poll = async () => {
      if (!active || jobs.length === 0) return
      const job = jobs[cursor % jobs.length]
      cursor += 1
      if (!job) return
      const arrivals = await fetchArrivals(job.line, job.station)
      if (!active) return
      if (arrivals) {
        const sightings = sightingsAtStation(job.line, job.station, arrivals, Date.now())
        trains = mergeSightings(trains, sightings, Date.now())
        setCount(trains.length)
      }
      timer = window.setTimeout(() => void poll(), GAP_MS)
    }
    void poll()

    const draw = (now: number) => {
      const seconds = Math.min(0.5, (now - last) / 1000)
      last = now
      trains = advanceTrains(trains, seconds)
      carry += seconds
      if (carry >= 0.2) {
        carry = 0
        setPoints(trainPoints(trains))
      }
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)

    return () => {
      active = false
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
    }
  }, [enabled])

  return { points, count }
}
