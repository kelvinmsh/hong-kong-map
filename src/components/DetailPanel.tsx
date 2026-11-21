import { RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { lineByCode, stationByCode } from '../data/network.ts'
import { cameraTitle, snapshotSrc, type Camera } from '../lib/cameras.ts'
import { clockLabel } from '../lib/schedule.ts'
import { useStationBoard } from '../lib/useStationBoard.ts'
import { Button } from './ui/button.tsx'

type DetailPanelProps = {
  stationCode: string | null
  camera: Camera | null
  onClose: () => void
}

export function DetailPanel({ stationCode, camera, onClose }: DetailPanelProps) {
  if (!stationCode && !camera) return null
  return (
    <aside className="pointer-events-auto absolute inset-x-3 bottom-14 z-20 flex max-h-[min(58dvh,34rem)] flex-col overflow-hidden rounded-3xl border border-[#e4dccf] bg-[#fffcf7]/97 shadow-[0_16px_50px_rgba(28,25,21,0.16)] sm:inset-x-auto sm:right-3 sm:top-3 sm:max-h-none sm:w-[23rem]">
      {stationCode ? <StationCard key={stationCode} code={stationCode} onClose={onClose} /> : null}
      {camera ? <CameraCard key={camera.key} camera={camera} onClose={onClose} /> : null}
    </aside>
  )
}

function StationCard({ code, onClose }: { code: string; onClose: () => void }) {
  const station = stationByCode(code)
  const { board, loading, reload } = useStationBoard(station)
  if (!station) return null
  const delayed = board.some((line) => line.delay)
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-[#efe8dc] px-4 py-3">
        <div>
          <p className="text-xs text-[#9a3412]">到站班次</p>
          <h2 className="text-xl font-bold">{station.zh}</h2>
          <p className="text-sm text-[#5c564e]">
            {station.en}
            {' · '}
            {station.lines.map((line) => lineByCode(line)?.zh ?? line).join('、')}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={reload} aria-label="重新整理班次">
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉">
            <X />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {station.code === 'RAC' ? (
          <p className="rounded-2xl bg-[#fff6e8] px-3 py-2 text-sm leading-6">
            馬場站只在賽馬日有列車。若下面兩個方向都沒有班次，代表現在沒有到站資料。
          </p>
        ) : null}
        {delayed ? (
          <p className="rounded-2xl bg-[#fde8e8] px-3 py-2 text-sm leading-6 text-[#9f1239]">
            港鐵表示列車服務有延誤。
          </p>
        ) : null}
        {loading && board.length === 0 ? <p className="text-sm text-[#5c564e]">正在查看到站班次…</p> : null}
        {board.map((line) => {
          const meta = lineByCode(line.line)
          return (
            <section key={line.line} className="rounded-2xl bg-[#f7f3ec] p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta?.color ?? '#1c1915' }} />
                  {meta?.zh ?? line.line}
                </h3>
                {line.current ? <p className="text-xs text-[#5c564e]">資料時間 {clockLabel(line.current)}</p> : null}
              </div>
              {line.message ? <p className="mt-2 text-sm leading-6">{line.message}</p> : null}
              {line.url ? (
                <a className="mt-1 inline-block text-sm underline" href={line.url} target="_blank" rel="noreferrer">
                  查看特別列車安排
                </a>
              ) : null}
              {line.state === 'ready'
                ? line.directions.map((direction) => (
                    <div key={direction.id} className="mt-3">
                      <p className="text-xs font-medium tracking-wide text-[#5c564e]">{direction.title}</p>
                      {direction.empty ? (
                        <p className="mt-1 text-sm">這個方向暫無班次。</p>
                      ) : (
                        <ul>
                          {direction.trains.map((train) => (
                            <li key={train.key} className="mt-2 border-t border-[#e4dccf] pt-2">
                              <p className="font-medium text-[#9a3412]">{train.minuteLabel}</p>
                              <p className="text-sm">
                                {train.destination}
                                <span className="text-[#5c564e]">
                                  {' · '}
                                  {train.platform}
                                  {train.clock ? ` · ${train.clock}` : ''}
                                </span>
                              </p>
                              {train.notes.length > 0 ? (
                                <p className="text-xs text-[#5c564e]">{train.notes.join(' · ')}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))
                : null}
            </section>
          )
        })}
        {loading && board.length > 0 ? <p className="text-xs text-[#5c564e]">正在更新…</p> : null}
      </div>
    </>
  )
}

function CameraCard({ camera, onClose }: { camera: Camera; onClose: () => void }) {
  const title = cameraTitle(camera.description, camera.key)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 120_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-[#efe8dc] px-4 py-3">
        <div>
          <p className="text-xs text-[#9a3412]">交通快拍</p>
          <h2 className="text-lg font-bold leading-6">{title}</h2>
          <p className="text-sm text-[#5c564e]">
            {camera.region} · {camera.district} · {camera.key}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="重新載入照片"
            onClick={() => {
              setFailed(false)
              setTick(Date.now())
            }}
          >
            <RefreshCw />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉">
            <X />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {failed ? (
          <p className="rounded-2xl bg-[#f7f3ec] px-3 py-6 text-center text-sm leading-6">暫時沒有這張快拍照片。</p>
        ) : (
          <img
            key={tick}
            src={snapshotSrc(camera.url, tick)}
            alt={title}
            width={320}
            height={240}
            referrerPolicy="no-referrer"
            className="w-full rounded-2xl bg-[#efe8dc]"
            onError={() => setFailed(true)}
          />
        )}
        <p className="text-sm leading-6 text-[#5c564e]">
          運輸署約每兩分鐘更新照片。若畫面寫著「暫時未能提供服務」，代表這個快拍點暫停。
        </p>
      </div>
    </>
  )
}
