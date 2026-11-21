import { describe, expect, it } from 'vitest'
import { clockLabel, displayTrain, minuteLabel, minutesUntil, publicMessage, readPayload } from './schedule.ts'

describe('arrival minutes', () => {
  it('uses the Hong Kong timestamps from the API', () => {
    expect(minutesUntil('2026-11-21 10:28:39', '2026-11-21 10:31:39')).toBe(3)
    expect(minutesUntil('2026-11-21 10:28:39', '2026-11-21 10:28:39')).toBe(0)
  })

  it('labels arrival and departure', () => {
    expect(minuteLabel(3, '')).toBe('3 分鐘')
    expect(minuteLabel(0, 'A')).toBe('即將到站')
    expect(minuteLabel(0, 'D')).toBe('即將開出')
    expect(minuteLabel(-5, 'A')).toBe('時間未明')
    expect(clockLabel('2026-11-21 10:31:39')).toBe('10:31')
  })

  it('reads a next-train payload and keeps an empty direction', () => {
    const payload = readPayload(
      {
        status: 1,
        message: 'successful',
        isdelay: 'N',
        data: {
          'EAL-RAC': {
            curr_time: '2026-11-21 10:29:17',
            sys_time: '2026-11-21 10:29:22',
            UP: [],
            DOWN: [],
          },
        },
      },
      'EAL',
      'RAC',
    )
    expect(payload.block?.up).toEqual([])
    expect(payload.block?.down).toEqual([])
    expect(publicMessage(payload.status, payload.message)).toBe('')
  })

  it('describes an East Rail train that runs via the racecourse', () => {
    const train = displayTrain(
      {
        seq: '1',
        dest: 'ADM',
        plat: '2',
        time: '2026-11-21 10:40:00',
        ttnt: '4',
        valid: 'Y',
        route: 'RAC',
        timeType: 'D',
      },
      '2026-11-21 10:36:00',
      { ADM: '金鐘' },
    )
    expect(train.destination).toBe('往金鐘')
    expect(train.platform).toBe('2 號月台')
    expect(train.minuteLabel).toBe('4 分鐘')
    expect(train.notes).toEqual(['開出', '經馬場，不經火炭'])
  })
})
