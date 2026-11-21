export type LiveTrain = {
  seq: string
  dest: string
  plat: string
  time: string
  ttnt: string
  valid: string
  route: string
  timeType: string
}

export type LiveBlock = {
  currTime: string
  sysTime: string
  up: LiveTrain[]
  down: LiveTrain[]
}

export type LivePayload = {
  status: number
  message: string
  url: string
  delay: boolean
  block: LiveBlock | null
}

export type DisplayTrain = {
  key: string
  destination: string
  platform: string
  clock: string
  minuteLabel: string
  notes: string[]
}

const TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

export function parseHongKongTime(value: string): number | null {
  if (!TIME.test(value)) return null
  const parsed = Date.parse(`${value.replace(' ', 'T')}+08:00`)
  return Number.isNaN(parsed) ? null : parsed
}

export function minutesUntil(current: string, arrival: string): number | null {
  const from = parseHongKongTime(current)
  const to = parseHongKongTime(arrival)
  if (from == null || to == null) return null
  return Math.round((to - from) / 60000)
}

export function clockLabel(value: string): string {
  return value.match(/(\d{2}:\d{2}):\d{2}$/)?.[1] ?? ''
}

export function minuteLabel(minutes: number | null, timeType: string): string {
  if (minutes == null || minutes < -1) return '時間未明'
  if (minutes <= 0) return timeType === 'D' ? '即將開出' : '即將到站'
  return `${minutes} 分鐘`
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function readTrain(value: unknown): LiveTrain | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const dest = text(row.dest)
  if (!dest) return null
  return {
    seq: text(row.seq),
    dest,
    plat: text(row.plat),
    time: text(row.time),
    ttnt: text(row.ttnt),
    valid: text(row.valid),
    route: text(row.route),
    timeType: text(row.timeType ?? row.timetype),
  }
}

function readList(value: unknown): LiveTrain[] {
  if (!Array.isArray(value)) return []
  return value.map(readTrain).filter((train): train is LiveTrain => train != null)
}

export function readPayload(body: unknown, line: string, station: string): LivePayload {
  const row = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const status = Number(row.status)
  const data = row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {}
  const rawBlock = data[`${line}-${station}`]
  let block: LiveBlock | null = null
  if (rawBlock && typeof rawBlock === 'object') {
    const blockRow = rawBlock as Record<string, unknown>
    block = {
      currTime: text(blockRow.curr_time) || text(row.curr_time),
      sysTime: text(blockRow.sys_time) || text(row.sys_time),
      up: readList(blockRow.UP),
      down: readList(blockRow.DOWN),
    }
  }
  return {
    status: Number.isNaN(status) ? -1 : status,
    message: text(row.message),
    url: text(row.url),
    delay: text(row.isdelay || row.Isdelay).toUpperCase() === 'Y',
    block,
  }
}

export function displayTrain(train: LiveTrain, current: string, names: Record<string, string>): DisplayTrain {
  const notes: string[] = []
  if (train.timeType === 'D') notes.push('開出')
  else if (train.timeType === 'A') notes.push('到站')
  if (train.route === 'RAC') notes.push('經馬場，不經火炭')
  if (train.valid === 'N') notes.push('此刻未能確認')
  const name = names[train.dest]
  return {
    key: `${train.seq}-${train.dest}-${train.time}-${train.plat}`,
    destination: name ? `往${name}` : `往${train.dest}`,
    platform: train.plat ? `${train.plat} 號月台` : '月台未明',
    clock: clockLabel(train.time),
    minuteLabel: minuteLabel(minutesUntil(current, train.time), train.timeType),
    notes,
  }
}

export function publicMessage(status: number, message: string): string {
  if (status === 0) return message || '港鐵暫時未能提供這條綫的班次。'
  if (message && message.toLowerCase() !== 'successful') return message
  return ''
}
