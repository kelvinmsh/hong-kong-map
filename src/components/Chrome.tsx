import { useEffect, useState } from 'react'
import { network } from '../data/network.ts'
import { Button } from './ui/button.tsx'
import { Switch } from './ui/switch.tsx'

type ChromeProps = {
  showRail: boolean
  showCameras: boolean
  cameraStatus: string
  stationCode: string
  onToggleRail: (value: boolean) => void
  onToggleCameras: (value: boolean) => void
  onStation: (code: string) => void
  onHome: () => void
}

function hongKongTime() {
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

export function Chrome({
  showRail,
  showCameras,
  cameraStatus,
  stationCode,
  onToggleRail,
  onToggleCameras,
  onStation,
  onHome,
}: ChromeProps) {
  const [clock, setClock] = useState(hongKongTime)
  useEffect(() => {
    const timer = window.setInterval(() => setClock(hongKongTime()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <header className="pointer-events-auto absolute left-3 top-3 z-20 w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border border-[#e4dccf] bg-[#fffcf7]/95 p-4 shadow-[0_12px_40px_rgba(28,25,21,0.12)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#9a3412]">香港時間 {clock}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">智慧城市地圖</h1>
        </div>
        <Button variant="outline" size="sm" onClick={onHome}>
          全港
        </Button>
      </div>
      <p className="mt-2 hidden text-sm leading-6 text-[#5c564e] sm:block">
        點車站查到站班次，點快拍點看運輸署最新路面照片。
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showRail} onCheckedChange={onToggleRail} aria-label="顯示港鐵網絡" />
          港鐵網絡
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showCameras} onCheckedChange={onToggleCameras} aria-label="顯示交通快拍" />
          交通快拍
        </label>
      </div>
      <label className="mt-3 block text-xs text-[#5c564e]" htmlFor="station-picker">
        選擇車站
        <select
          id="station-picker"
          className="mt-1 h-10 w-full rounded-xl border border-[#d6cfc3] bg-white px-3 text-sm text-[#1c1915]"
          value={stationCode}
          onChange={(event) => {
            if (event.target.value) onStation(event.target.value)
          }}
        >
          <option value="">在地圖上點選，或在這裡選擇</option>
          {network.stations.map((station) => (
            <option key={station.code} value={station.code}>
              {station.zh}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs leading-5 text-[#5c564e]">{cameraStatus}</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-[#5c564e]">路綫圖例</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {network.lines.map((line) => (
            <li key={line.code} className="flex items-center gap-2">
              <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: line.color }} />
              {line.zh}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#c2410c]" />
            交通快拍
          </li>
        </ul>
        <p className="mt-2 text-xs leading-5 text-[#5c564e]">
          色線依車站順序連接。東鐵在上水分岔往羅湖和落馬洲，將軍澳綫在將軍澳分岔往康城。虛線是馬場側線，平日列車不經該站。
        </p>
      </details>
    </header>
  )
}
