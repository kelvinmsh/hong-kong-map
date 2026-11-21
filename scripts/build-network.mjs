/**
 * Builds the static MTR network used by the map.
 * Station order and names come from the official MTR route file.
 * Coordinates are bbox centers from the Lands Department station polygons.
 * Racecourse is in the Lands data and the next-train API, but not in the route file.
 */
const ROUTE_URL = 'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv'
const VENUE_URL =
  'https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_venue_polygon?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application/json'

const LINES = [
  { code: 'AEL', zh: '機場快綫', color: '#1C7670', offset: -5, up: '往博覽館', down: '往香港' },
  { code: 'TCL', zh: '東涌綫', color: '#F7941D', offset: 5, up: '往東涌', down: '往香港' },
  { code: 'TML', zh: '屯馬綫', color: '#9A3B26', offset: -3, up: '往屯門', down: '往烏溪沙' },
  { code: 'TKL', zh: '將軍澳綫', color: '#6B208B', offset: 3, up: '往寶琳／康城', down: '往北角' },
  { code: 'EAL', zh: '東鐵綫', color: '#5EB6E4', offset: 0, up: '往羅湖／落馬洲', down: '往金鐘' },
  { code: 'SIL', zh: '南港島綫', color: '#A3B000', offset: 6, up: '往海怡半島', down: '往金鐘' },
  { code: 'TWL', zh: '荃灣綫', color: '#E2231A', offset: -6, up: '往荃灣', down: '往中環' },
  { code: 'ISL', zh: '港島綫', color: '#007DC5', offset: 2, up: '往柴灣', down: '往堅尼地城' },
  { code: 'KTL', zh: '觀塘綫', color: '#00AB4E', offset: -2, up: '往調景嶺', down: '往黃埔' },
  { code: 'DRL', zh: '迪士尼綫', color: '#F550A6', offset: 4, up: '往欣澳', down: '往迪士尼' },
]

const headers = {
  Accept: 'application/json, text/csv, */*',
  'User-Agent': 'hk-smart-city-map/0.1 (classroom project; station geometry build)',
}

function norm(value) {
  return value
    .toLowerCase()
    .replace(/station/g, '')
    .replace(/railway/g, '')
    .replace(/mtr/g, '')
    .replace(/鐵路站|站/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  const head = lines[0].split(',').map((cell) => cell.replace(/^"|"$/g, ''))
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(',').map((cell) => cell.replace(/^"|"$/g, ''))
    return Object.fromEntries(head.map((key, index) => [key, cells[index] ?? '']))
  })
}

function sequence(rows, line, direction) {
  return rows
    .filter((row) => row['Line Code'] === line && row.Direction === direction && row['Station Code'])
    .sort((a, b) => Number(a.Sequence) - Number(b.Sequence))
    .map((row) => row['Station Code'])
}

function haversine(a, b) {
  const earth = 6371000
  const p1 = (a[1] * Math.PI) / 180
  const p2 = (b[1] * Math.PI) / 180
  const dp = ((b[1] - a[1]) * Math.PI) / 180
  const dl = ((b[0] - a[0]) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

function project(start, end, point) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = dx * dx + dy * dy
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length))
  return [start[0] + t * dx, start[1] + t * dy]
}

const [routeText, venuePayload] = await Promise.all([
  fetch(ROUTE_URL, { headers }).then((response) => {
    if (!response.ok) throw new Error(`Route file HTTP ${response.status}`)
    return response.text()
  }),
  fetch(VENUE_URL, { headers }).then((response) => {
    if (!response.ok) throw new Error(`Venue file HTTP ${response.status}`)
    return response.json()
  }),
])

const rows = parseCsv(routeText).filter((row) => row['Line Code'] && row['Station Code'])
const stations = new Map()
for (const row of rows) {
  if (!stations.has(row['Station Code'])) {
    stations.set(row['Station Code'], {
      code: row['Station Code'],
      zh: row['Chinese Name'],
      en: row['English Name'],
      lines: [],
    })
  }
}

const venues = new Map()
for (const feature of venuePayload.features ?? []) {
  const properties = feature.properties
  const box = properties.bbox
  venues.set(norm(properties.venue_name_en), {
    en: properties.venue_name_en,
    zh: properties.venue_name_zh,
    lon: (box[0] + box[2]) / 2,
    lat: (box[1] + box[3]) / 2,
  })
}

for (const station of stations.values()) {
  const venue = venues.get(norm(station.en))
  if (!venue) throw new Error(`No Lands Department coordinate for ${station.code} ${station.en}`)
  station.lon = Number(venue.lon.toFixed(6))
  station.lat = Number(venue.lat.toFixed(6))
}

const racecourse = venues.get(norm('Racecourse'))
if (!racecourse) throw new Error('Lands Department venue list has no Racecourse Station')
stations.set('RAC', {
  code: 'RAC',
  zh: '馬場',
  en: 'Racecourse',
  lon: Number(racecourse.lon.toFixed(6)),
  lat: Number(racecourse.lat.toFixed(6)),
  lines: ['EAL'],
})

if (stations.size !== 98) throw new Error(`Expected 98 stations, found ${stations.size}`)

const point = (code) => {
  const station = stations.get(code)
  if (!station) throw new Error(`Missing station ${code}`)
  return [station.lon, station.lat]
}

const networkLines = LINES.map((line) => {
  const main = sequence(rows, line.code, 'UT')
  if (main.length < 2) throw new Error(`${line.code} has no UT sequence`)
  const paths = [{ kind: 'main', codes: main, coordinates: main.map(point) }]

  if (line.code === 'EAL') {
    paths.push({ kind: 'branch', codes: ['SHS', 'LMC'], coordinates: ['SHS', 'LMC'].map(point) })
    const fot = point('FOT')
    const uni = point('UNI')
    const rac = point('RAC')
    const foot = project(fot, uni, rac).map((value) => Number(value.toFixed(6)))
    paths.push({ kind: 'spur', codes: ['RAC'], coordinates: [foot, rac] })
  }

  if (line.code === 'TKL') {
    paths.push({ kind: 'branch', codes: ['TKO', 'LHP'], coordinates: ['TKO', 'LHP'].map(point) })
  }

  return { ...line, paths }
})

for (const line of networkLines) {
  for (const code of line.paths.filter((path) => path.kind !== 'spur').flatMap((path) => path.codes)) {
    const station = stations.get(code)
    if (!station.lines.includes(line.code)) station.lines.push(line.code)
  }
}

for (const station of stations.values()) {
  station.lines.sort(
    (a, b) => LINES.findIndex((line) => line.code === a) - LINES.findIndex((line) => line.code === b),
  )
  if (station.lat < 22.13 || station.lat > 22.58 || station.lon < 113.8 || station.lon > 114.5) {
    throw new Error(`${station.code} is outside Hong Kong`)
  }
}

const island = networkLines.find((line) => line.code === 'ISL').paths[0].coordinates
for (let index = 1; index < island.length; index += 1) {
  const distance = haversine(island[index - 1], island[index])
  if (distance < 400 || distance > 2000) {
    throw new Error(`Island Line hop ${index} is ${Math.round(distance)} m`)
  }
}

const eastRail = networkLines.find((line) => line.code === 'EAL')
const eastCodes = eastRail.paths[0].codes
if (eastCodes.at(-1) !== 'LOW') throw new Error('East Rail main line should end at Lo Wu')
if (eastCodes.includes('RAC') || eastCodes.includes('LMC')) {
  throw new Error('Racecourse and Lok Ma Chau must stay off the East Rail main sequence')
}
if (eastCodes[eastCodes.indexOf('FOT') + 1] !== 'UNI') {
  throw new Error('Fo Tan should be followed by University on the main East Rail line')
}

const payload = {
  generatedAt: new Date().toISOString(),
  sources: { routes: ROUTE_URL, venues: VENUE_URL },
  lines: networkLines,
  stations: [...stations.values()].sort((a, b) => a.zh.localeCompare(b.zh, 'zh-Hant')),
}

const file = new URL('../src/data/network.json', import.meta.url)
await import('node:fs/promises').then((fs) => fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`))
console.log(`Wrote ${payload.stations.length} stations and ${payload.lines.length} lines`)
