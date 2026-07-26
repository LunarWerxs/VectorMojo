import { describe, expect, test } from 'bun:test'
import {
  GUEST_CONVERSION_KEY,
  GUEST_CONVERSION_LIMIT,
  guestConversionsRemaining,
  readGuestConversionCount,
  recordGuestConversion,
  type UsageStorage,
} from '../src/lib/guest-usage'

function memoryStorage(initial?: string): UsageStorage {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(GUEST_CONVERSION_KEY, initial)
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('guest conversion usage', () => {
  test('starts at zero and records successful conversions', () => {
    const storage = memoryStorage()
    expect(readGuestConversionCount(storage)).toBe(0)
    expect(recordGuestConversion(storage)).toBe(1)
    expect(readGuestConversionCount(storage)).toBe(1)
  })

  test('caps malformed and excessive values safely', () => {
    expect(readGuestConversionCount(memoryStorage('not-a-number'))).toBe(0)
    expect(readGuestConversionCount(memoryStorage('999'))).toBe(
      GUEST_CONVERSION_LIMIT,
    )
  })

  test('reports remaining guest conversions', () => {
    expect(guestConversionsRemaining(4)).toBe(6)
    expect(guestConversionsRemaining(GUEST_CONVERSION_LIMIT)).toBe(0)
  })
})
