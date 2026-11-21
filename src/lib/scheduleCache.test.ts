import { describe, expect, it } from 'vitest'
import { memoryStore, type KeyValueStore } from './browserStore.ts'
import { ERROR_RETRY_MS, RELOAD_MAX_AGE_MS, SCHEDULE_GAP_MS } from './pacing.ts'
import { createScheduleCache, type ScheduleCache } from './scheduleCache.ts'

function clock(start = 1_000_000) {
  let time = start
  return {
    now: () => time,
    wait: async (ms: number) => {
      time += ms
    },
    advance(ms: number) {
      time += ms
    },
  }
}

function locks() {
  let busy = false
  return {
    async request(
      _name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: { name: string } | null) => Promise<unknown>,
    ) {
      if (busy) return callback(options.ifAvailable ? null : { name: 'held' })
      busy = true
      try {
        return await callback({ name: 'hk-map-schedule' })
      } finally {
        busy = false
      }
    },
  }
}

function harness(fetchImpl: typeof fetch, storage: KeyValueStore = memoryStore()) {
  const time = clock()
  const cache = createScheduleCache({
    fetchImpl,
    now: time.now,
    wait: time.wait,
    storage,
    locks: locks(),
    autoStart: false,
  })
  return { cache, time }
}

function countingFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    return handler(url)
  }
  return { calls, fetchImpl }
}

async function read(cache: ScheduleCache, line: string, station: string, maxAge: number) {
  const release = cache.hold(line, station, maxAge)
  const step = await cache.pumpOnce()
  return { release, step }
}

describe('schedule cache', () => {
  it('fetches a station once and then serves the copy until it is due', async () => {
    const { calls, fetchImpl } = countingFetch(() => Response.json({ status: 1, message: 'successful' }))
    const { cache, time } = harness(fetchImpl)
    const first = await read(cache, 'ISL', 'CEN', 30_000)
    expect(first.step).toBe('fetched')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('line=ISL')
    expect(calls[0]).toContain('sta=CEN')

    const second = await read(cache, 'ISL', 'CEN', 30_000)
    expect(second.step).toBe('idle')
    expect(calls).toHaveLength(1)

    time.advance(30_000)
    const third = await cache.pumpOnce()
    expect(third).toBe('fetched')
    expect(calls).toHaveLength(2)
    first.release()
    second.release()
  })

  it('does not retry a 429, and waits out Retry-After', async () => {
    const { calls, fetchImpl } = countingFetch(
      () => new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
    )
    const { cache, time } = harness(fetchImpl)
    const release = cache.hold('TWL', 'CEN', 30_000)
    expect(await cache.pumpOnce()).toBe('fetched')
    expect(calls).toHaveLength(1)
    expect(cache.peek('TWL', 'CEN')?.error).toBe('rate')

    expect(await cache.pumpOnce()).toBe('paused')
    expect(calls).toHaveLength(1)

    time.advance(cache.pauseUntil() - time.now() - 1)
    expect(await cache.pumpOnce()).toBe('paused')
    time.advance(1)
    expect(await cache.pumpOnce()).toBe('fetched')
    expect(calls).toHaveLength(2)
    release()
  })

  it('keeps the last good timetable when the next request fails', async () => {
    let failed = false
    const { calls, fetchImpl } = countingFetch(() => {
      if (!failed) {
        failed = true
        return Response.json({ status: 1, mark: 'first' })
      }
      throw new Error('offline')
    })
    const { cache, time } = harness(fetchImpl)
    const release = cache.hold('EAL', 'ADM', 30_000)
    await cache.pumpOnce()
    time.advance(30_000)
    await cache.pumpOnce()
    const entry = cache.peek('EAL', 'ADM')
    expect(entry?.ok).toBe(true)
    expect(entry?.body).toMatchObject({ mark: 'first' })
    expect(entry?.error).toBe('network')
    expect(calls).toHaveLength(2)

    expect(await cache.pumpOnce()).toBe('idle')
    time.advance(ERROR_RETRY_MS)
    expect(await cache.pumpOnce()).toBe('fetched')
    expect(calls).toHaveLength(3)
    release()
  })

  it('shares one response across caches and lets only one request through at a time', async () => {
    const storage = memoryStore()
    const shared = locks()
    const time = clock()
    const { calls, fetchImpl } = countingFetch(() => Response.json({ status: 1 }))
    const options = {
      fetchImpl,
      now: time.now,
      wait: time.wait,
      storage,
      locks: shared,
      autoStart: false as const,
    }
    const first = createScheduleCache(options)
    const second = createScheduleCache(options)
    const releaseFirst = first.hold('KTL', 'MOK', 30_000)
    const releaseSecond = second.hold('ISL', 'HKU', 30_000)
    const steps = await Promise.all([first.pumpOnce(), second.pumpOnce()])
    expect(calls).toHaveLength(1)
    expect(steps.slice().sort()).toEqual(['busy', 'fetched'])

    expect(await second.pumpOnce()).toBe('fetched')
    expect(calls).toHaveLength(2)
    expect(time.now() - 1_000_000).toBeGreaterThanOrEqual(SCHEDULE_GAP_MS)
    releaseFirst()
    releaseSecond()
  })

  it('asks for a station the open board needs before an older train sample', async () => {
    const { calls, fetchImpl } = countingFetch(() => Response.json({ status: 1 }))
    const { cache } = harness(fetchImpl)
    const board = cache.hold('ISL', 'ADM', 30_000)
    const train = cache.hold('DRL', 'DIS', 120_000)
    await cache.pumpOnce()
    expect(calls[0]).toContain('sta=ADM')
    await cache.pumpOnce()
    expect(calls[1]).toContain('sta=DIS')
    board()
    train()
  })

  it('refuses a manual refresh inside the source update window', async () => {
    const { calls, fetchImpl } = countingFetch(() => Response.json({ status: 1 }))
    const { cache, time } = harness(fetchImpl)
    const release = cache.hold('SIL', 'ADM', 30_000)
    await cache.pumpOnce()
    expect(cache.requestSoon('SIL', 'ADM')).toBe(false)
    expect(await cache.pumpOnce()).toBe('idle')
    expect(calls).toHaveLength(1)

    time.advance(RELOAD_MAX_AGE_MS)
    expect(cache.requestSoon('SIL', 'ADM')).toBe(true)
    expect(await cache.pumpOnce()).toBe('fetched')
    expect(calls).toHaveLength(2)
    release()
  })

  it('does not call out while the tab is hidden', async () => {
    const { calls, fetchImpl } = countingFetch(() => Response.json({ status: 1 }))
    const time = clock()
    let hidden = true
    const cache = createScheduleCache({
      fetchImpl,
      now: time.now,
      wait: time.wait,
      storage: memoryStore(),
      hidden: () => hidden,
      autoStart: false,
    })
    const release = cache.hold('AEL', 'HOK', 30_000)
    expect(await cache.pumpOnce()).toBe('hidden')
    expect(calls).toHaveLength(0)
    hidden = false
    expect(await cache.pumpOnce()).toBe('fetched')
    expect(calls).toHaveLength(1)
    release()
  })
})
