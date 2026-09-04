// Anonymous visit ping to the Studio web-ping endpoint (the AnatomyOf pattern:
// studio.connections.icu/v1/app/<id>/latest). One fire-and-forget GET per
// browser session. The server derives only coarse geo/network/locale context
// from the request itself (never an IP address) plus what this file sends: a
// random visitor id, the app version, and a referrer hostname. No cookies, no
// file data, no user data - VectorMojo's file conversion stays entirely
// local; this is the one network call the app ever makes on its own. Honors
// Do Not Track / Global Privacy Control, skips localhost, and a failure here
// can never affect the app.

const APP_ID = 'vectormojo'
const PING_URL = `https://studio.connections.icu/v1/app/${APP_ID}/latest`
const ID_KEY = `${APP_ID}:visitor-id`
const SESSION_KEY = `${APP_ID}:pinged`

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  )
}

// Named conversion events (adapted from PostHog's manual-event-tracking idea,
// posthog-js, Apache-2.0, (c) 2015 Mixpanel, Inc., (c) PostHog Inc. - not
// vendored code, just the "named events on an opt-out foundation" pattern).
// Adapted for VectorMojo: reuses the same visitor id, DNT/GPC honoring, and
// no-cors fire-and-forget delivery as sendVisitPing() above, extended with an
// `event` name and a couple of narrow, enum-shaped fields. VectorMojo's core
// promise is that files never leave the device, so an event may only ever
// carry a closed set of small identifiers (format tags, export kind) -
// never a file name, its bytes, or its pixel/geometry dimensions.
export type AnalyticsEvent =
  | { name: 'convert'; format: string }
  | { name: 'guest_quota_hit' }
  | { name: 'export'; kind: 'svg' | 'png' | 'pdf' | 'copy' }

/**
 * Pure mapping from an AnalyticsEvent to the extra query fields it sends,
 * beyond the shared `iid`/`v`. Kept separate from sendEvent() below so the
 * exact, closed set of fields per event (and that nothing else sneaks in)
 * can be asserted without a browser/DOM environment.
 */
export function eventFields(event: AnalyticsEvent): Record<string, string> {
  switch (event.name) {
    case 'convert':
      return { event: event.name, format: event.format }
    case 'export':
      return { event: event.name, format: event.kind }
    case 'guest_quota_hit':
      return { event: event.name }
  }
}

/**
 * Fire a single named conversion event on the same privacy-respecting
 * foundation as sendVisitPing(): skipped under DNT/GPC or on localhost, best
 * effort (a delivery failure never surfaces to the app), and never carrying
 * anything beyond the fixed set of fields eventFields() returns.
 */
export function sendEvent(event: AnalyticsEvent): void {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return
    if (isLocalHost(window.location.hostname)) return

    // Unlike sendVisitPing()'s "new visit" bookkeeping, a named event has
    // nothing that depends on delivery succeeding first, so the id can be
    // created and persisted immediately.
    let id: string
    try {
      id = localStorage.getItem(ID_KEY) ?? crypto.randomUUID()
      localStorage.setItem(ID_KEY, id)
    } catch {
      return // no durable id available: skip rather than send an unlinkable event
    }

    const params = new URLSearchParams({ iid: id, v: __APP_VERSION__, ...eventFields(event) })

    fetch(`${PING_URL}?${params.toString()}`, { mode: 'no-cors', keepalive: true }).catch(() => {
      // best-effort, no retries
    })
  } catch {
    // storage/fetch unavailable (private mode, extensions): skip silently
  }
}

export function sendVisitPing(): void {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return
    if (isLocalHost(window.location.hostname)) return
    if (sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.setItem(SESSION_KEY, '1')

    // The stored id's mere presence is what marks a visit as not-first, so it
    // must not be written until the ping that reports "new" has actually
    // gone out (see the .then() below) - otherwise a failed first ping would
    // silently and permanently lose the "new" signal.
    const existingId = localStorage.getItem(ID_KEY)
    const firstVisit = !existingId
    const id = existingId ?? crypto.randomUUID()

    const params = new URLSearchParams({ iid: id, v: __APP_VERSION__ })
    if (firstVisit) params.set('new', '1')
    if (document.referrer) {
      try {
        // Hostname only - never the full referrer URL (path/query can carry
        // identifying detail we have no business forwarding).
        params.set('ref', new URL(document.referrer).hostname)
      } catch {
        // malformed referrer: omit rather than send anything unparsed
      }
    }

    // no-cors: the request still reaches the server (that IS the ping); the
    // opaque response can't be read, and no-cors forbids custom headers, so
    // the id rides in the query string instead.
    fetch(`${PING_URL}?${params.toString()}`, { mode: 'no-cors', keepalive: true })
      .then(() => {
        localStorage.setItem(ID_KEY, id)
      })
      .catch(() => {
        // best-effort, no retries within this page load
      })
  } catch {
    // storage/fetch unavailable (private mode, extensions): skip silently
  }
}
