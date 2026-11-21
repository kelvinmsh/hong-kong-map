/**
 * Follows OpenStreetMap MTR track centre lines between official stations.
 * Straight station-to-station chords are only used when a track path cannot be found.
 */
const TRACK_URL = 'https://overpass-api.de/api/interpreter'
const TRACK_QUERY = `[out:json][timeout:160];
relation["route"="subway"]["network"="港鐵 MTR"]["ref"~"^(TWL|TKL|KTL|EAL|ISL|DRL|AEL|TCL|TML|SIL)$"](22.15,113.8,22.58,114.45);
out geom;`

export function haversine(a, b) {
  const earth = 6371000
  const p1 = (a[1] * Math.PI) / 180
  const p2 = (b[1] * Math.PI) / 180
  const dp = ((b[1] - a[1]) * Math.PI) / 180
  const dl = ((b[0] - a[0]) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(h))
}

function roundPoint(lon, lat) {
  return [Number(lon.toFixed(5)), Number(lat.toFixed(5))]
}

function keyOf(point) {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`
}

class Heap {
  constructor() {
    this.items = []
  }

  push(cost, key) {
    this.items.push([cost, key])
    this.up(this.items.length - 1)
  }

  pop() {
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last) {
      this.items[0] = last
      this.down(0)
    }
    return top
  }

  up(index) {
    const item = this.items[index]
    if (!item) return
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      const parentItem = this.items[parent]
      if (!parentItem || parentItem[0] <= item[0]) break
      this.items[index] = parentItem
      index = parent
    }
    this.items[index] = item
  }

  down(index) {
    const item = this.items[index]
    if (!item) return
    const length = this.items.length
    while (true) {
      let smallest = index
      const left = index * 2 + 1
      const right = left + 1
      const leftItem = this.items[left]
      const rightItem = this.items[right]
      if (left < length && leftItem && leftItem[0] < (this.items[smallest]?.[0] ?? Infinity)) smallest = left
      if (right < length && rightItem && rightItem[0] < (this.items[smallest]?.[0] ?? Infinity)) smallest = right
      if (smallest === index) break
      const swap = this.items[smallest]
      if (!swap) break
      this.items[index] = swap
      index = smallest
    }
    this.items[index] = item
  }
}

function addEdge(adj, from, to, meters) {
  const list = adj.get(from) ?? []
  const existing = list.find((edge) => edge.to === to)
  if (!existing || existing.meters > meters) {
    if (existing) existing.meters = meters
    else list.push({ to, meters })
  }
  adj.set(from, list)
}

function buildGraph(polylines) {
  const nodes = new Map()
  const adj = new Map()
  const seen = new Set()
  for (const line of polylines) {
    const points = line.map(([lon, lat]) => roundPoint(lon, lat))
    const signature = points.map(keyOf).join(';')
    if (seen.has(signature)) continue
    seen.add(signature)
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]
      const to = points[index]
      if (!from || !to) continue
      const fromKey = keyOf(from)
      const toKey = keyOf(to)
      if (fromKey === toKey) continue
      nodes.set(fromKey, from)
      nodes.set(toKey, to)
      const meters = haversine(from, to)
      addEdge(adj, fromKey, toKey, meters)
      addEdge(adj, toKey, fromKey, meters)
    }
  }

  const endpoints = [...adj.entries()].filter(([, edges]) => edges.length === 1).map(([key]) => key)
  for (let left = 0; left < endpoints.length; left += 1) {
    for (let right = left + 1; right < endpoints.length; right += 1) {
      const a = endpoints[left]
      const b = endpoints[right]
      const aPoint = a ? nodes.get(a) : undefined
      const bPoint = b ? nodes.get(b) : undefined
      if (!a || !b || !aPoint || !bPoint) continue
      const meters = haversine(aPoint, bPoint)
      if (meters > 0 && meters <= 40) {
        addEdge(adj, a, b, meters)
        addEdge(adj, b, a, meters)
      }
    }
  }
  return { nodes, adj }
}

function nearestKey(graph, point, limit) {
  let best = null
  let bestDistance = limit
  for (const [key, node] of graph.nodes) {
    const distance = haversine(node, point)
    if (distance < bestDistance) {
      bestDistance = distance
      best = key
    }
  }
  return best
}

function route(graph, start, end) {
  if (start === end) {
    const point = graph.nodes.get(start)
    return point ? [point] : null
  }
  const distance = new Map([[start, 0]])
  const previous = new Map()
  const heap = new Heap()
  heap.push(0, start)
  while (heap.items.length > 0) {
    const next = heap.pop()
    if (!next) break
    const [cost, key] = next
    if (cost !== distance.get(key)) continue
    if (key === end) break
    for (const edge of graph.adj.get(key) ?? []) {
      const nextCost = cost + edge.meters
      if (nextCost < (distance.get(edge.to) ?? Infinity)) {
        distance.set(edge.to, nextCost)
        previous.set(edge.to, key)
        heap.push(nextCost, edge.to)
      }
    }
  }
  if (!previous.has(end)) return null
  const keys = [end]
  let cursor = end
  while (cursor !== start) {
    const prior = previous.get(cursor)
    if (!prior) return null
    keys.push(prior)
    cursor = prior
  }
  keys.reverse()
  return keys.map((key) => graph.nodes.get(key)).filter((point) => point != null)
}

function join(paths) {
  const coordinates = []
  for (const path of paths) {
    for (const point of path) {
      const last = coordinates.at(-1)
      if (!last || haversine(last, point) > 0.5) coordinates.push(point)
    }
  }
  return coordinates
}

function pathLength(path) {
  return path.reduce((sum, point, index) => (index === 0 ? 0 : sum + haversine(path[index - 1], point)), 0)
}

function hitsAnotherStation(path, stations, fromIndex, toIndex) {
  return stations.some((station, index) => {
    if (index === fromIndex || index === toIndex) return false
    return distanceToPath(station, path) < 180
  })
}

function traceStations(graph, stations) {
  const hops = []
  const straightHops = []
  let cursor = nearestKey(graph, stations[0], 700)
  if (!cursor) throw new Error('No track within 700 m of the first station')
  for (let index = 1; index < stations.length; index += 1) {
    const station = stations[index]
    const previous = stations[index - 1]
    const next = nearestKey(graph, station, 700)
    if (!next || !previous) throw new Error('No track within 700 m of a station')
    const path = route(graph, cursor, next)
    const straight = haversine(previous, station)
    const length = path ? pathLength(path) : Infinity
    const detour = !path || hitsAnotherStation(path, stations, index - 1, index) || length > straight * 3 || length > straight + 2500
    if (detour) {
      hops.push([previous, station])
      straightHops.push(index)
    } else if (path) {
      hops.push(path)
    }
    cursor = next
  }
  return { coordinates: join(hops), straightHops }
}

function distanceToPath(point, coordinates) {
  let best = Infinity
  for (const vertex of coordinates) best = Math.min(best, haversine(point, vertex))
  return best
}

function trimSpur(main, spur) {
  let cut = 0
  for (let index = 0; index < spur.length - 1; index += 1) {
    if (distanceToPath(spur[index], main) > 45) break
    cut = index
  }
  return spur.slice(cut)
}

export async function loadTrackGraphs() {
  const response = await fetch(TRACK_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'hk-smart-city-map/0.1 (classroom project; track geometry)',
    },
    body: `data=${encodeURIComponent(TRACK_QUERY)}`,
  })
  if (!response.ok) throw new Error(`OpenStreetMap track request HTTP ${response.status}`)
  const payload = await response.json()
  const lines = new Map()
  for (const relation of payload.elements ?? []) {
    const ref = relation.tags?.ref
    if (!ref || relation.tags?.network !== '港鐵 MTR') continue
    const polylines = lines.get(ref) ?? []
    for (const member of relation.members ?? []) {
      if (member.type !== 'way' || member.role || !member.geometry || member.geometry.length < 2) continue
      polylines.push(member.geometry.map((point) => [point.lon, point.lat]))
    }
    lines.set(ref, polylines)
  }
  return new Map([...lines.entries()].map(([ref, polylines]) => [ref, buildGraph(polylines)]))
}

export function curveThroughStations(graph, stations) {
  return traceStations(graph, stations).coordinates
}

export function curveSpur(graph, main, racecourse) {
  const target = nearestKey(graph, racecourse, 700)
  if (!target || main.length === 0) return [racecourse]
  let nearestMain = main[0]
  let best = Infinity
  for (const point of main) {
    const distance = haversine(point, racecourse)
    if (distance < best) {
      best = distance
      nearestMain = point
    }
  }
  const start = nearestKey(graph, nearestMain, 150)
  if (!start) return [nearestMain, racecourse]
  const path = route(graph, start, target)
  if (!path) return [nearestMain, racecourse]
  const trimmed = trimSpur(main, path)
  return trimmed.length >= 2 ? trimmed : path
}

export { distanceToPath }
