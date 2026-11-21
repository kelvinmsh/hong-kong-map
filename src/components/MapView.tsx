import {
  AttributionControl,
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { network, railFeatures, stationByCode, stationFeatures } from '../data/network.ts'
import type { Camera } from '../lib/cameras.ts'

setWorkerUrl(workerUrl)

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

type MapViewProps = {
  cameras: Camera[]
  showRail: boolean
  showCameras: boolean
  selectedStation: string | null
  selectedCamera: string | null
  focusStation: number
  homeToken: number
  onSelectStation: (code: string, zoomedOut: boolean) => void
  onSelectCamera: (key: string) => void
  onClear: () => void
}

function collection<T>(features: T[]) {
  return { type: 'FeatureCollection' as const, features }
}

function fitCity(map: MapLibreMap) {
  const bounds = new LngLatBounds()
  for (const station of network.stations) bounds.extend([station.lon, station.lat])
  const wide = window.innerWidth >= 768
  map.fitBounds(bounds, {
    padding: { top: wide ? 92 : 150, bottom: 78, left: 36, right: wide ? 48 : 28 },
    duration: 700,
    maxZoom: 11,
  })
}

function cameraFeatures(cameras: Camera[]) {
  return collection(
    cameras.map((camera) => ({
      type: 'Feature' as const,
      properties: { key: camera.key },
      geometry: { type: 'Point' as const, coordinates: [camera.lon, camera.lat] as [number, number] },
    })),
  )
}

export function MapView({
  cameras,
  showRail,
  showCameras,
  selectedStation,
  selectedCamera,
  focusStation,
  homeToken,
  onSelectStation,
  onSelectCamera,
  onClear,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const handlers = useRef({ onSelectStation, onSelectCamera, onClear })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: STYLE,
      center: [114.15, 22.35],
      zoom: 10.2,
      minZoom: 9,
      maxZoom: 14,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left')
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right')
    mapRef.current = map
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container)

    map.on('load', () => {
      map.addSource('rail', { type: 'geojson', data: collection(railFeatures(false)) })
      map.addSource('spur', { type: 'geojson', data: collection(railFeatures(true)) })
      map.addSource('stations', { type: 'geojson', data: collection(stationFeatures()) })
      map.addSource('cameras', {
        type: 'geojson',
        data: collection([]),
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 12,
      })

      for (const line of network.lines) {
        const filter = ['==', ['get', 'code'], line.code] as ['==', ['get', string], string]
        map.addLayer({
          id: `rail-casing-${line.code}`,
          type: 'line',
          source: 'rail',
          filter,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#fffcf7', 'line-width': 7, 'line-opacity': 0.92, 'line-offset': line.offset },
        })
        map.addLayer({
          id: `rail-line-${line.code}`,
          type: 'line',
          source: 'rail',
          filter,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': line.color, 'line-width': 3.4, 'line-offset': line.offset },
        })
      }

      map.addLayer({
        id: 'rail-spur',
        type: 'line',
        source: 'spur',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#5EB6E4', 'line-width': 2.4, 'line-dasharray': [1.2, 1.4] },
      })
      map.addLayer({
        id: 'cameras-cluster',
        type: 'circle',
        source: 'cameras',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#9a3412',
          'circle-radius': ['step', ['get', 'point_count'], 14, 30, 18, 80, 23],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fffcf7',
        },
      })
      map.addLayer({
        id: 'cameras-count',
        type: 'symbol',
        source: 'cameras',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#fffcf7' },
      })
      map.addLayer({
        id: 'cameras-point',
        type: 'circle',
        source: 'cameras',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#c2410c',
          'circle-radius': 6.5,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fffcf7',
        },
      })
      map.addLayer({
        id: 'stations',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-color': '#fffcf7',
          'circle-radius': 5.5,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#1c1915',
        },
      })
      map.addLayer({
        id: 'station-labels',
        type: 'symbol',
        source: 'stations',
        minzoom: 12.2,
        layout: {
          'text-field': ['get', 'zh'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, 0.85],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#1c1915', 'text-halo-color': '#fffcf7', 'text-halo-width': 1.3 },
      })

      map.on('click', (event: MapMouseEvent) => {
        const stationHit = map.queryRenderedFeatures(event.point, { layers: ['stations'] })[0]
        if (stationHit) {
          const code = String(stationHit.properties.code ?? '')
          handlers.current.onSelectStation(code, map.getZoom() < 12)
          return
        }
        const cameraHit = map.queryRenderedFeatures(event.point, { layers: ['cameras-point'] })[0]
        if (cameraHit) {
          handlers.current.onSelectCamera(String(cameraHit.properties.key ?? ''))
          return
        }
        const cluster = map.queryRenderedFeatures(event.point, { layers: ['cameras-cluster'] })[0]
        if (cluster && cluster.geometry.type === 'Point') {
          const source = map.getSource('cameras')
          const clusterId = Number(cluster.properties.cluster_id)
          if (source instanceof GeoJSONSource && Number.isFinite(clusterId)) {
            void source.getClusterExpansionZoom(clusterId).then((zoom) => {
              const coordinates = cluster.geometry.type === 'Point' ? cluster.geometry.coordinates : null
              if (!coordinates) return
              map.easeTo({ center: [coordinates[0], coordinates[1]], zoom })
            })
          }
          return
        }
        handlers.current.onClear()
      })

      map.on('mousemove', (event: MapMouseEvent) => {
        const hits = map.queryRenderedFeatures(event.point, {
          layers: ['stations', 'cameras-point', 'cameras-cluster'],
        })
        map.getCanvas().style.cursor = hits.length > 0 ? 'pointer' : ''
      })

      fitCity(map)
      setFailed(false)
      setReady(true)
    })

    map.on('error', () => {
      if (!map.loaded()) setFailed(true)
    })

    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    handlers.current = { onSelectStation, onSelectCamera, onClear }
  }, [onClear, onSelectCamera, onSelectStation])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const source = map.getSource('cameras')
    if (source instanceof GeoJSONSource) source.setData(cameraFeatures(cameras))
  }, [cameras, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const rail = showRail ? 'visible' : 'none'
    const camera = showCameras ? 'visible' : 'none'
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.id.startsWith('rail-') || layer.id === 'stations' || layer.id === 'station-labels') {
        map.setLayoutProperty(layer.id, 'visibility', rail)
      }
      if (layer.id.startsWith('cameras-')) map.setLayoutProperty(layer.id, 'visibility', camera)
    }
  }, [ready, showCameras, showRail])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setPaintProperty('stations', 'circle-stroke-color', [
      'case',
      ['==', ['get', 'code'], selectedStation ?? ''],
      '#9a3412',
      '#1c1915',
    ])
    map.setPaintProperty('stations', 'circle-radius', [
      'case',
      ['==', ['get', 'code'], selectedStation ?? ''],
      8,
      5.5,
    ])
    map.setPaintProperty('cameras-point', 'circle-radius', [
      'case',
      ['==', ['get', 'key'], selectedCamera ?? ''],
      9,
      6.5,
    ])
  }, [ready, selectedCamera, selectedStation])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !selectedStation || focusStation === 0) return
    const station = stationByCode(selectedStation)
    if (!station) return
    const wide = window.innerWidth >= 768
    map.easeTo({
      center: [station.lon, station.lat],
      zoom: Math.max(map.getZoom(), 13),
      padding: { top: 90, right: wide ? 390 : 20, bottom: wide ? 70 : 240, left: 30 },
      duration: 700,
    })
  }, [focusStation, ready, selectedStation])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || homeToken === 0) return
    fitCity(map)
  }, [homeToken, ready])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {failed ? (
        <div className="absolute inset-x-3 top-3 z-20 mx-auto max-w-md rounded-2xl bg-[#fffcf7] p-4 text-sm shadow-lg">
          <p className="font-medium">底圖暫時未能載入。</p>
          <p className="mt-1 text-[#5c564e]">
            OpenFreeMap 是免費公開服務，沒有服務保證。請重新整理頁面再試。港鐵和快拍資料仍會在底圖恢復後顯示。
          </p>
          <button
            type="button"
            className="mt-3 rounded-full bg-[#1c1915] px-4 py-2 text-[#fffcf7]"
            onClick={() => window.location.reload()}
          >
            重新整理
          </button>
        </div>
      ) : null}
    </>
  )
}
