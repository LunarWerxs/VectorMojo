// Tests the pure event->field mapping in src/lib/analytics.ts. sendEvent()
// itself touches navigator/localStorage/fetch and isn't exercised here (the
// existing sendVisitPing() has the same DOM dependency and no test either);
// eventFields() is what determines what actually leaves the device, so it is
// the part worth pinning down. These would fail if the mapping were removed
// or if a disallowed field (a file name, bytes, or dimensions) ever crept in.
import { describe, expect, test } from 'bun:test'
import { eventFields, type AnalyticsEvent } from '../src/lib/analytics'

describe('analytics event fields', () => {
  test('convert event carries only the event name and format tag', () => {
    const fields = eventFields({ name: 'convert', format: 'psd' })
    expect(fields).toEqual({ event: 'convert', format: 'psd' })
  })

  test('export event carries only the event name and export kind', () => {
    const fields = eventFields({ name: 'export', kind: 'png' })
    expect(fields).toEqual({ event: 'export', format: 'png' })
  })

  test('guest_quota_hit event carries only the event name', () => {
    const fields = eventFields({ name: 'guest_quota_hit' })
    expect(fields).toEqual({ event: 'guest_quota_hit' })
  })

  test('no event ever carries a filename, byte data, or pixel dimensions', () => {
    const events: AnalyticsEvent[] = [
      { name: 'convert', format: 'pdf' },
      { name: 'export', kind: 'svg' },
      { name: 'guest_quota_hit' },
    ]
    const forbidden = ['name', 'file', 'size', 'width', 'height', 'bytes', 'content', 'svg']
    for (const event of events) {
      const keys = Object.keys(eventFields(event))
      for (const key of keys) {
        expect(forbidden).not.toContain(key)
      }
    }
  })
})
