import { useEffect, useMemo, useState } from 'react'
import { Chrome } from './components/Chrome.tsx'
import { DetailPanel } from './components/DetailPanel.tsx'
import { MapView } from './components/MapView.tsx'
import { loadCameras, type Camera } from './lib/cameras.ts'
import { useMovingTrains } from './lib/useMovingTrains.ts'

const NO_CAMERAS: Camera[] = []

type Selection = { kind: 'station'; code: string; focus: number } | { kind: 'camera'; key: string } | null

type CameraLoad = { status: 'loading' } | { status: 'ready'; cameras: Camera[] } | { status: 'error' }

export default function App() {
  const [showRail, setShowRail] = useState(true)
  const [showCameras, setShowCameras] = useState(true)
  const [showTrains, setShowTrains] = useState(true)
  const movingTrains = useMovingTrains(showTrains)
  const [selection, setSelection] = useState<Selection>(null)
  const [homeToken, setHomeToken] = useState(0)
  const [cameraLoad, setCameraLoad] = useState<CameraLoad>({ status: 'loading' })

  useEffect(() => {
    let active = true
    loadCameras()
      .then((cameras) => {
        if (active) setCameraLoad({ status: 'ready', cameras })
      })
      .catch(() => {
        if (active) setCameraLoad({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cameras = cameraLoad.status === 'ready' ? cameraLoad.cameras : NO_CAMERAS
  const selectedCamera = useMemo(() => {
    if (selection?.kind !== 'camera') return null
    return cameras.find((camera) => camera.key === selection.key) ?? null
  }, [cameras, selection])

  const cameraStatus =
    cameraLoad.status === 'loading'
      ? '正在載入交通快拍點…'
      : cameraLoad.status === 'error'
        ? '交通快拍清單暫時未能載入。港鐵網絡仍可使用。'
        : `已載入 ${cameraLoad.cameras.length.toLocaleString('zh-Hant')} 個快拍點`

  return (
    <main className="relative h-dvh overflow-hidden bg-[#e7e1d6] text-[#1c1915]">
      <MapView
        cameras={cameras}
        showRail={showRail}
        showCameras={showCameras}
        showTrains={showTrains}
        trains={movingTrains.points}
        selectedStation={selection?.kind === 'station' ? selection.code : null}
        selectedCamera={selection?.kind === 'camera' ? selection.key : null}
        focusStation={selection?.kind === 'station' ? selection.focus : 0}
        homeToken={homeToken}
        onSelectStation={(code, zoomedOut) => setSelection({ kind: 'station', code, focus: zoomedOut ? Date.now() : 0 })}
        onSelectCamera={(key) => setSelection({ kind: 'camera', key })}
        onClear={() => setSelection(null)}
      />
      <Chrome
        showRail={showRail}
        showCameras={showCameras}
        showTrains={showTrains}
        trainCount={movingTrains.count}
        cameraStatus={cameraStatus}
        stationCode={selection?.kind === 'station' ? selection.code : ''}
        onToggleRail={setShowRail}
        onToggleCameras={setShowCameras}
        onToggleTrains={setShowTrains}
        onStation={(code) => setSelection({ kind: 'station', code, focus: Date.now() })}
        onHome={() => {
          setSelection(null)
          setHomeToken((value) => value + 1)
        }}
      />
      {!selection ? (
        <p className="pointer-events-none absolute inset-x-3 bottom-36 z-10 text-center sm:bottom-16">
          <span className="inline-block rounded-full bg-[#fffcf7]/95 px-4 py-2 text-sm shadow">
            點選車站查看到站班次。彩色圓點是沿路軌移動的列車。
          </span>
        </p>
      ) : null}
      <DetailPanel
        stationCode={selection?.kind === 'station' ? selection.code : null}
        camera={selectedCamera}
        onClose={() => setSelection(null)}
      />
      <footer className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 sm:inset-x-14">
        <img
          src="/landsd-logo.svg"
          alt="地政總署"
          className="h-8 w-8 rounded bg-white object-cover object-left sm:h-7 sm:w-auto sm:object-contain"
        />
        <p className="rounded-full bg-[#fffcf7]/92 px-3 py-1 text-[11px] leading-4 text-[#3f3a34] shadow-sm">
          Map from Lands Department
          <span className="hidden sm:inline"> · 車站位置為地政總署車站範圍中心</span>
          <span className="hidden md:inline"> · 到站班次：港鐵公司 · 快拍：運輸署</span>
        </p>
      </footer>
    </main>
  )
}
