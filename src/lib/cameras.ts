import { browserStore, type KeyValueStore } from './browserStore.ts'
import { CAMERA_LIST_STALE_MS, CAMERA_LIST_TTL_MS, SNAPSHOT_RETRY_MS, SNAPSHOT_SLOT_MS } from './pacing.ts'

export type Camera = {
  key: string
  region: string
  district: string
  description: string
  lat: number
  lon: number
  url: string
}

export const CAMERA_LIST_URL =
  'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml'

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function field(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? decodeXml(match[1].trim()) : ''
}

export function parseCameraXml(xml: string): Camera[] {
  const blocks = xml.match(/<image>[\s\S]*?<\/image>/g) ?? []
  const cameras: Camera[] = []
  for (const block of blocks) {
    const latText = field(block, 'latitude')
    const lonText = field(block, 'longitude')
    const lat = Number(latText)
    const lon = Number(lonText)
    const key = field(block, 'key')
    const url = field(block, 'url')
    if (!key || !url || !latText || !lonText || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    cameras.push({
      key,
      region: field(block, 'region'),
      district: field(block, 'district'),
      description: field(block, 'description'),
      lat,
      lon,
      url,
    })
  }
  return cameras
}

export function cameraTitle(description: string, key: string): string {
  const stripped = description.replace(new RegExp(`\\s*\\[${key}\\]\\s*$`), '').trim()
  return stripped || '未有地點說明'
}

export function snapshotSrc(url: string, now: number): string {
  const slot = Math.floor(now / SNAPSHOT_SLOT_MS)
  return `${url}${url.includes('?') ? '&' : '?'}t=${slot}`
}

export function snapshotRetryAllowed(triedAt: number, now: number): boolean {
  return now - triedAt >= SNAPSHOT_RETRY_MS
}

const CAMERA_KEY = 'hk-map:cameras:v1'

type StoredCameras = { at: number; cameras: Camera[] }

function isCamera(value: unknown): value is Camera {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.key === 'string' &&
    typeof row.region === 'string' &&
    typeof row.district === 'string' &&
    typeof row.description === 'string' &&
    typeof row.lat === 'number' &&
    typeof row.lon === 'number' &&
    typeof row.url === 'string'
  )
}

function readStoredCameras(storage: KeyValueStore, now: number, staleMs: number): StoredCameras | null {
  const raw = storage.get(CAMERA_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { at?: unknown; cameras?: unknown }
    if (typeof value.at !== 'number' || now - value.at > staleMs || !Array.isArray(value.cameras)) return null
    const cameras = value.cameras.filter(isCamera)
    if (cameras.length === 0) return null
    return { at: value.at, cameras }
  } catch {
    return null
  }
}

export async function loadCameraList(options: {
  fetchImpl: typeof fetch
  now: () => number
  storage: KeyValueStore
  flights: { current: Promise<Camera[]> | null }
  ttlMs?: number
  staleMs?: number
}): Promise<Camera[]> {
  const ttlMs = options.ttlMs ?? CAMERA_LIST_TTL_MS
  const staleMs = options.staleMs ?? CAMERA_LIST_STALE_MS
  const now = options.now()
  const cached = readStoredCameras(options.storage, now, staleMs)
  if (cached && now - cached.at < ttlMs) return cached.cameras
  if (options.flights.current) return options.flights.current

  const run = (async () => {
    try {
      const response = await options.fetchImpl(CAMERA_LIST_URL, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) throw new Error(`Camera list HTTP ${response.status}`)
      const cameras = parseCameraXml(await response.text())
      if (cameras.length === 0) throw new Error('Camera list was empty')
      options.storage.set(CAMERA_KEY, JSON.stringify({ at: options.now(), cameras }))
      return cameras
    } catch (error) {
      const fallback = readStoredCameras(options.storage, options.now(), staleMs)
      if (fallback) return fallback.cameras
      throw error
    }
  })().finally(() => {
    if (options.flights.current === run) options.flights.current = null
  })

  options.flights.current = run
  return run
}

const cameraFlight: { current: Promise<Camera[]> | null } = { current: null }

export function loadCameras(): Promise<Camera[]> {
  return loadCameraList({
    fetchImpl: globalThis.fetch.bind(globalThis),
    now: () => Date.now(),
    storage: browserStore(),
    flights: cameraFlight,
  })
}
