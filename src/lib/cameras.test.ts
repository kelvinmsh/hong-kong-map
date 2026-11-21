import { describe, expect, it } from 'vitest'
import { cameraTitle, parseCameraXml, snapshotSrc } from './cameras.ts'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<image-list>
  <image>
    <key>H106F</key>
    <region>香港島</region>
    <district>中西區</district>
    <description>干諾道中近交易廣場 [H106F]</description>
    <latitude>22.285967</latitude>
    <longitude>114.155749</longitude>
    <url>https://tdcctv.data.one.gov.hk/H106F.JPG</url>
  </image>
  <image>
    <key>BAD</key>
    <description>缺座標</description>
    <url>https://tdcctv.data.one.gov.hk/BAD.JPG</url>
  </image>
</image-list>`

describe('traffic cameras', () => {
  it('keeps cameras that have coordinates and drops the rest', () => {
    const cameras = parseCameraXml(SAMPLE)
    expect(cameras).toHaveLength(1)
    expect(cameras[0]).toMatchObject({
      key: 'H106F',
      region: '香港島',
      lat: 22.285967,
      lon: 114.155749,
    })
  })

  it('removes the camera key from the visible title', () => {
    expect(cameraTitle('干諾道中近交易廣場 [H106F]', 'H106F')).toBe('干諾道中近交易廣場')
  })

  it('changes the photo address on the two-minute slot', () => {
    expect(snapshotSrc('https://tdcctv.data.one.gov.hk/H106F.JPG', 120_000)).toBe(
      'https://tdcctv.data.one.gov.hk/H106F.JPG?t=1',
    )
  })
})
