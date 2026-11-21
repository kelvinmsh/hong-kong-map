import { describe, expect, it } from 'vitest'
import { memoryStore } from './browserStore.ts'
import { cameraTitle, loadCameraList, parseCameraXml, snapshotRetryAllowed, snapshotSrc } from './cameras.ts'
import { CAMERA_LIST_TTL_MS, SNAPSHOT_RETRY_MS } from './pacing.ts'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<image-list>
  <image>
    <key>H106F</key>
    <region>香港島</region>
    <district>中西區</district>
    <description>干諾道中近交易廣場 [H106F]</description>
    <latitude>22.285967</latitude>
    <longitude>114.155749</longitude>
    <url>https://tdcctv.data.one.gov.hk/H106F.JPG</url>
  </image>
  <image>
    <key>BAD</key>
    <description>缺座標</description>
    <url>https://tdcctv.data.one.gov.hk/BAD.JPG</url>
  </image>
</image-list>`

describe('traffic cameras', () => {
  it('keeps cameras that have coordinates and drops the rest', () => {
    const cameras = parseCameraXml(SAMPLE)
    expect(cameras).toHaveLength(1)
    expect(cameras[0]).toMatchObject({
      key: 'H106F',
      region: '香港島',
      lat: 22.285967,
      lon: 114.155749,
    })
  })

  it('removes the camera key from the visible title', () => {
    expect(cameraTitle('干諾道中近交易廣場 [H106F]', 'H106F')).toBe('干諾道中近交易廣場')
  })

  it('changes the photo address on the two-minute slot', () => {
    expect(snapshotSrc('https://tdcctv.data.one.gov.hk/H106F.JPG', 120_000)).toBe(
      'https://tdcctv.data.one.gov.hk/H106F.JPG?t=1',
    )
  })

  it('waits before retrying a snapshot that failed', () => {
    expect(snapshotRetryAllowed(1_000, 1_000 + SNAPSHOT_RETRY_MS - 1)).toBe(false)
    expect(snapshotRetryAllowed(1_000, 1_000 + SNAPSHOT_RETRY_MS)).toBe(true)
  })
})

describe('camera list cache', () => {
  it('downloads the list once and reuses it', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return new Response(SAMPLE)
    }
    const storage = memoryStore()
    const now = () => 5_000
    const first = await loadCameraList({ fetchImpl, now, storage, flights: { current: null } })
    const second = await loadCameraList({ fetchImpl, now, storage, flights: { current: null } })
    expect(first).toHaveLength(1)
    expect(second).toEqual(first)
    expect(calls).toBe(1)
  })

  it('joins a download that is already running', async () => {
    let calls = 0
    let release: ((response: Response) => void) | undefined
    const fetchImpl: typeof fetch = () => {
      calls += 1
      return new Promise((resolve) => {
        release = resolve
      })
    }
    const flights: { current: Promise<ReturnType<typeof parseCameraXml>> | null } = { current: null }
    const storage = memoryStore()
    const first = loadCameraList({ fetchImpl, now: () => 0, storage, flights })
    const second = loadCameraList({ fetchImpl, now: () => 0, storage, flights })
    expect(calls).toBe(1)
    release?.(new Response(SAMPLE))
    await expect(first).resolves.toHaveLength(1)
    await expect(second).resolves.toHaveLength(1)
  })

  it('uses a saved list when the download fails, and refreshes after the same day', async () => {
    const storage = memoryStore()
    let fail = false
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      if (fail) throw new Error('offline')
      return new Response(SAMPLE)
    }
    await loadCameraList({ fetchImpl, now: () => 0, storage, flights: { current: null } })
    fail = true
    const stale = await loadCameraList({
      fetchImpl,
      now: () => CAMERA_LIST_TTL_MS + 1,
      storage,
      flights: { current: null },
    })
    expect(stale).toHaveLength(1)
    expect(calls).toBe(2)
  })
})
