import {
  displayTrain,
  publicMessage,
  readPayload,
  type DisplayTrain,
  type LiveTrain,
} from './schedule.ts'

export type BoardDirection = {
  id: 'UP' | 'DOWN'
  title: string
  trains: DisplayTrain[]
  empty: boolean
}

export type BoardLine = {
  line: string
  state: 'ready' | 'rate' | 'error'
  message: string
  url: string
  delay: boolean
  current: string
  directions: BoardDirection[]
}

const RETRY_MS = 1200

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function requestSchedule(line: string, station: string): Promise<Response> {
  const url = new URL('https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php')
  url.searchParams.set('line', line)
  url.searchParams.set('sta', station)
  url.searchParams.set('lang', 'TC')
  let response = await fetch(url)
  if (response.status === 429) {
    await wait(RETRY_MS)
    response = await fetch(url)
  }
  return response
}

function failed(line: string, state: 'rate' | 'error', message: string): BoardLine {
  return { line, state, message, url: '', delay: false, current: '', directions: [] }
}

function showTrains(rows: LiveTrain[], current: string, names: Record<string, string>): DisplayTrain[] {
  return [...rows]
    .sort((left, right) => Number(left.seq) - Number(right.seq))
    .map((row) => displayTrain(row, current, names))
}

function direction(
  id: 'UP' | 'DOWN',
  title: string,
  rows: LiveTrain[],
  current: string,
  names: Record<string, string>,
): BoardDirection {
  return { id, title, trains: showTrains(rows, current, names), empty: rows.length === 0 }
}

export async function loadLine(
  line: string,
  station: string,
  titles: { up: string; down: string },
  names: Record<string, string>,
): Promise<BoardLine> {
  try {
    const response = await requestSchedule(line, station)
    if (response.status === 429) return failed(line, 'rate', '查詢過於頻繁，請稍後再按重新整理。')
    if (!response.ok) return failed(line, 'error', '這條綫的班次暫時未能讀取。')
    const payload = readPayload(await response.json(), line, station)
    const current = payload.block?.currTime ?? ''
    return {
      line,
      state: 'ready',
      message: publicMessage(payload.status, payload.message),
      url: payload.url,
      delay: payload.delay,
      current,
      directions: [
        direction('UP', titles.up, payload.block?.up ?? [], current, names),
        direction('DOWN', titles.down, payload.block?.down ?? [], current, names),
      ],
    }
  } catch {
    return failed(line, 'error', '這條綫的班次暫時未能讀取。')
  }
}
