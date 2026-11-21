import { browserStore, type KeyValueStore } from './browserStore.ts'
import {
  ERROR_RETRY_MS,
  RATE_LIMIT_FALLBACK_MS,
  RATE_LIMIT_MAX_MS,
  RATE_LIMIT_MIN_MS,
  RELOAD_MAX_AGE_MS,
  SCHEDULE_DEADLINE_MS,
  SCHEDULE_GAP_MS,
} from './pacing.ts'

const PREFIX = 'hk-map:mtr:v1:'
const PAUSE_KEY = `${PREFIX}pause`
const LOCK_NAME = 'hk-map-schedule'

export type ScheduleError = 'rate' | 'http' | 'network'

export type ScheduleEntry = {
  at: number
  attemptedAt: number
  ok: boolean
  status: number
  body: unknown
  retryAt: number
  error: ScheduleError | null
}

export type ScheduleStep = 'fetched' | 'idle' | 'paused' | 'hidden' | 'busy'

type LockLike = {
  request(
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => Promise<unknown>,
  ): Promise<unknown>
}

export type ScheduleCache = {
  hold(line: string, station: string, maxAge: number): () => void
  requestSoon(line: string, station: string): boolean
  peek(line: string, station: string): ScheduleEntry | null
  pauseUntil(): number
  subscribe(listener: () => void): () => void
  pumpOnce(): Promise<ScheduleStep>
}

type CacheOptions = {
  fetchImpl: typeof fetch
  now: () => number
  wait: (ms: number) => Promise<void>
  storage?: KeyValueStore
  locks?: LockLike
  hidden?: () => boolean
  gapMs?: number
  autoStart?: boolean
}

function cacheKey(line: string, station: string) {
  return `${line}:${station}`
}

function storageKey(key: string) {
  return `${PREFIX}${key}`
}

function clampWait(ms: number) {
  if (!Number.isFinite(ms)) return RATE_LIMIT_FALLBACK_MS
  return Math.min(RATE_LIMIT_MAX_MS, Math.max(RATE_LIMIT_MIN_MS, ms))
}

export function retryDelay(header: string | null, now: number) {
  if (!header) return RATE_LIMIT_FALLBACK_MS
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return clampWait(seconds * 1000)
  const dated = Date.parse(header)
  if (Number.isFinite(dated)) return clampWait(dated - now)
  return RATE_LIMIT_FALLBACK_MS
}

function readEntry(raw: string | null): ScheduleEntry | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<ScheduleEntry>
    if (!value || typeof value.at !== 'number' || typeof value.attemptedAt !== 'number' || typeof value.ok !== 'boolean') {
      return null
    }
    const error = value.error === 'rate' || value.error === 'http' || value.error === 'network' ? value.error : null
    return {
      at: value.at,
      attemptedAt: value.attemptedAt,
      ok: value.ok,
      status: typeof value.status === 'number' ? value.status : 0,
      body: value.body ?? null,
      retryAt: typeof value.retryAt === 'number' ? value.retryAt : 0,
      error,
    }
  } catch {
    return null
  }
}

function endpoint(line: string, station: string) {
  const url = new URL('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php')
  url.searchParams.set('line', line)
  url.searchParams.set('sta', station)
  url.searchParams.set('lang', 'TC')
  return url
}

export function createScheduleCache(options: CacheOptions): ScheduleCache {
  const storage = options.storage ?? browserStore()
  const gapMs = options.gapMs ?? SCHEDULE_GAP_MS
  const hidden = options.hidden ?? (() => false)
  const memory = new Map<string, ScheduleEntry>()
  const held = new Map<string, Map<number, number>>()
  const boosts = new Map<string, number>()
  const listeners = new Set<() => void>()
  let nextId = 1
  let pauseUntil = 0
  let locked = false
  let running = false
  let sleeper: (() => void) | null = null
  let listening = false

  function wake() {
    sleeper?.()
  }

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // A broken listener must not stop the shared queue.
      }
    }
  }

  function currentPause() {
    const stored = Number(storage.get(PAUSE_KEY) ?? 0)
    if (Number.isFinite(stored) && stored > pauseUntil) pauseUntil = stored
    return pauseUntil
  }

  function setPause(until: number) {
    pauseUntil = Math.max(currentPause(), until)
    storage.set(PAUSE_KEY, String(pauseUntil))
    notify()
  }

  function peek(line: string, station: string) {
    const key = cacheKey(line, station)
    const cached = memory.get(key)
    if (cached) return cached
    const stored = readEntry(storage.get(storageKey(key)))
    if (!stored) return null
    memory.set(key, stored)
    return stored
  }

  function write(key: string, entry: ScheduleEntry) {
    memory.set(key, entry)
    storage.set(storageKey(key), JSON.stringify(entry))
    notify()
  }

  function maxAgeFor(key: string) {
    const bucket = held.get(key)
    if (!bucket || bucket.size === 0) return null
    let age = Math.min(...bucket.values())
    const boost = boosts.get(key)
    if (boost != null) age = Math.min(age, boost)
    return age
  }

  function isDue(key: string, now: number) {
    if (now < currentPause()) return false
    const maxAge = maxAgeFor(key)
    if (maxAge == null) return false
    const entry = memory.get(key) ?? readEntry(storage.get(storageKey(key)))
    if (entry) memory.set(key, entry)
    if (!entry) return true
    if (now < entry.retryAt) return false
    if (!entry.ok) return true
    return now - entry.at >= maxAge
  }

  function pickDue(now: number) {
    const due: { key: string; line: string; station: string; maxAge: number; score: number }[] = []
    for (const [key, bucket] of held) {
      if (bucket.size === 0 || !isDue(key, now)) continue
      const maxAge = maxAgeFor(key)
      if (maxAge == null) continue
      const [line = '', station = ''] = key.split(':')
      const entry = memory.get(key)
      const age = !entry || !entry.ok ? Number.POSITIVE_INFINITY : now - entry.at
      due.push({ key, line, station, maxAge, score: age / maxAge })
    }
    due.sort((left, right) => {
      if (left.score !== right.score) {
        if (!Number.isFinite(left.score)) return -1
        if (!Number.isFinite(right.score)) return 1
        return right.score - left.score
      }
      return left.maxAge - right.maxAge || left.key.localeCompare(right.key)
    })
    return due[0] ?? null
  }

  function nextDueIn(now: number) {
    let soonest = 5_000
    for (const key of held.keys()) {
      const maxAge = maxAgeFor(key)
      if (maxAge == null) continue
      const entry = memory.get(key) ?? readEntry(storage.get(storageKey(key)))
      if (!entry) return 0
      const moment = !entry.ok || now < entry.retryAt ? entry.retryAt : entry.at + maxAge
      soonest = Math.min(soonest, Math.max(0, moment - now))
    }
    return soonest
  }

  function rememberFailure(key: string, error: ScheduleError, status: number, retryAt: number) {
    const now = options.now()
    const previous = memory.get(key) ?? readEntry(storage.get(storageKey(key)))
    if (previous?.ok) {
      write(key, { ...previous, attemptedAt: now, status, error, retryAt })
      return
    }
    write(key, {
      at: now,
      attemptedAt: now,
      ok: false,
      status,
      body: null,
      retryAt,
      error,
    })
  }

  async function fetchKey(line: string, station: string) {
    const key = cacheKey(line, station)
    const now = options.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SCHEDULE_DEADLINE_MS)
    try {
      const response = await options.fetchImpl(endpoint(line, station), {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
      if (response.status === 429) {
        const until = options.now() + retryDelay(response.headers.get('Retry-After'), options.now())
        setPause(until)
        rememberFailure(key, 'rate', 429, until)
        await response.body?.cancel().catch(() => undefined)
        return
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        rememberFailure(key, 'http', response.status, options.now() + ERROR_RETRY_MS)
        return
      }
      const body: unknown = await response.json()
      write(key, {
        at: options.now(),
        attemptedAt: options.now(),
        ok: true,
        status: response.status,
        body,
        retryAt: 0,
        error: null,
      })
    } catch {
      rememberFailure(key, 'network', 0, now + ERROR_RETRY_MS)
    } finally {
      clearTimeout(timer)
      boosts.delete(key)
    }
  }

  async function withSlot<T>(run: () => Promise<T>): Promise<T | 'busy'> {
    const started = options.now()
    const exec = async () => {
      try {
        return await run()
      } finally {
        const rest = gapMs - (options.now() - started)
        if (rest > 0) await options.wait(rest)
      }
    }
    const locks = options.locks
    if (!locks) {
      if (locked) return 'busy'
      locked = true
      try {
        return await exec()
      } finally {
        locked = false
      }
    }
    let result: T | 'busy' = 'busy'
    await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) return
      result = await exec()
    })
    return result
  }

  async function pumpOnce(): Promise<ScheduleStep> {
    const now = options.now()
    if (hidden()) return 'hidden'
    if (now < currentPause()) return 'paused'
    const target = pickDue(now)
    if (!target) return 'idle'
    const outcome = await withSlot(async () => {
      if (hidden() || options.now() < currentPause() || !isDue(target.key, options.now())) {
        const entry = memory.get(target.key)
        if (entry?.ok && options.now() - entry.at < RELOAD_MAX_AGE_MS) boosts.delete(target.key)
        return 'idle' as const
      }
      await fetchKey(target.line, target.station)
      return 'fetched' as const
    })
    return outcome === 'busy' ? 'busy' : outcome
  }

  function listen() {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('storage', (event) => {
      if (!event.key?.startsWith(PREFIX)) return
      if (event.key === PAUSE_KEY) {
        const stored = Number(event.newValue ?? 0)
        if (Number.isFinite(stored)) pauseUntil = Math.max(pauseUntil, stored)
      } else {
        memory.delete(event.key.slice(PREFIX.length))
      }
      notify()
      wake()
    })
    window.addEventListener('visibilitychange', () => {
      if (!document.hidden) wake()
    })
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        sleeper = null
        resolve()
      }, ms)
      sleeper = () => {
        clearTimeout(timer)
        sleeper = null
        resolve()
      }
    })
  }

  async function ensureLoop() {
    if (!options.autoStart || running) return
    listen()
    running = true
    try {
      while (held.size > 0) {
        let step: ScheduleStep = 'idle'
        try {
          step = await pumpOnce()
        } catch {
          step = 'idle'
        }
        if (held.size === 0) break
        if (step === 'fetched') continue
        const now = options.now()
        const delay =
          step === 'busy' ? 400 : step === 'paused' ? Math.min(Math.max(currentPause() - now, 200), 5_000) : step === 'hidden' ? 2_000 : Math.min(Math.max(nextDueIn(now), 200), 5_000)
        await sleep(delay)
      }
    } finally {
      running = false
      if (options.autoStart && held.size > 0) void ensureLoop()
    }
  }

  return {
    hold(line, station, maxAge) {
      const key = cacheKey(line, station)
      const id = nextId
      nextId += 1
      const bucket = held.get(key) ?? new Map<number, number>()
      bucket.set(id, maxAge)
      held.set(key, bucket)
      void ensureLoop()
      wake()
      return () => {
        bucket.delete(id)
        if (bucket.size === 0) {
          held.delete(key)
          boosts.delete(key)
        }
      }
    },
    requestSoon(line, station) {
      const key = cacheKey(line, station)
      if (maxAgeFor(key) == null) return false
      const now = options.now()
      if (now < currentPause()) return false
      const entry = peek(line, station)
      if (entry && now < entry.retryAt) return false
      if (entry?.ok && now - entry.at < RELOAD_MAX_AGE_MS) return false
      boosts.set(key, RELOAD_MAX_AGE_MS)
      wake()
      void ensureLoop()
      return true
    },
    peek,
    pauseUntil: currentPause,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    pumpOnce,
  }
}

function browserLocks(): LockLike | undefined {
  const locks = globalThis.navigator?.locks
  if (!locks) return undefined
  return {
    request: (name, options, callback) => locks.request(name, options, callback),
  }
}

export const scheduleCache = createScheduleCache({
  fetchImpl: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  storage: browserStore(),
  locks: browserLocks(),
  hidden: () => globalThis.document?.hidden ?? false,
  autoStart: true,
})
