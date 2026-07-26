export const GUEST_CONVERSION_LIMIT = 10
export const GUEST_CONVERSION_KEY = 'vectormojo:guest-conversions:v1'

export interface UsageStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

let memoryCount = 0

function browserStorage(): UsageStorage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Strict privacy modes may expose localStorage but refuse access.
  }
  return null
}

function normalizedCount(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) return 0
  return Math.min(value, GUEST_CONVERSION_LIMIT)
}

export function readGuestConversionCount(storage?: UsageStorage | null): number {
  const target = storage === undefined ? browserStorage() : storage
  if (!target) return memoryCount
  try {
    return normalizedCount(target.getItem(GUEST_CONVERSION_KEY))
  } catch {
    return memoryCount
  }
}

export function recordGuestConversion(storage?: UsageStorage | null): number {
  const target = storage === undefined ? browserStorage() : storage
  const next = Math.min(
    GUEST_CONVERSION_LIMIT,
    readGuestConversionCount(target) + 1,
  )
  memoryCount = next
  try {
    target?.setItem(GUEST_CONVERSION_KEY, String(next))
  } catch {
    // Keep enforcing the limit for this tab even when persistent storage fails.
  }
  return next
}

export function guestConversionsRemaining(count: number): number {
  return Math.max(0, GUEST_CONVERSION_LIMIT - normalizedCount(String(count)))
}
