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
  const slot = Math.floor(now / 120_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${slot}`
}

export async function loadCameras(): Promise<Camera[]> {
  const response = await fetch(CAMERA_LIST_URL)
  if (!response.ok) throw new Error(`Camera list HTTP ${response.status}`)
  const cameras = parseCameraXml(await response.text())
  if (cameras.length === 0) throw new Error('Camera list was empty')
  return cameras
}
