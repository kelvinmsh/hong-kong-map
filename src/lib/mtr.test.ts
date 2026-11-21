import { describe, expect, it } from 'vitest'
import { arrivalsFromEntry, toBoardLine } from './mtr.ts'
import { BOARD_MAX_AGE_MS } from './pacing.ts'

const entry = {
  at: Date.parse('2026-11-21T02:00:00Z'),
  ok: true,
  error: null,
  body: {
    status: 1,
    message: 'successful',
    curr_time: '2026-11-21 10:00:00',
    data: {
      'ISL-CEN': {
        UP: [{ seq: '1', dest: 'CHW', plat: '1', time: '2026-11-21 10:04:00', ttnt: '4', valid: 'Y' }],
        DOWN: [],
      },
    },
  },
}

describe('cached board', () => {
  it('counts the remaining minutes from now, not from the old response clock', () => {
    const now = Date.parse('2026-11-21T02:03:00Z')
    const board = toBoardLine(entry, 'ISL', 'CEN', { up: '往柴灣', down: '往堅尼地城' }, { CHW: '柴灣' }, now, 0)
    expect(board?.directions[0]?.trains[0]?.minuteLabel).toBe('1 分鐘')
    expect(board?.current).toBe('2026-11-21 10:00:00')
  })

  it('keeps the last trains on screen when the shared queue is paused', () => {
    const now = entry.at + BOARD_MAX_AGE_MS + 1_000
    const board = toBoardLine(entry, 'ISL', 'CEN', { up: '往柴灣', down: '往堅尼地城' }, { CHW: '柴灣' }, now, now + 60_000)
    expect(board?.state).toBe('ready')
    expect(board?.message).toContain('先顯示剛才的班次')
    expect(arrivalsFromEntry(entry, 'ISL', 'CEN')?.up).toEqual([{ dest: 'CHW', ttnt: 4 }])
  })
})
