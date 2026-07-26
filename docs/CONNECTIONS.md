# Connections integration

VectorMojo is a static browser application. It uses `@cnct/connect` 1.2's
hosted-popup flow rather than adding a backend or an application-owned callback
route:

1. `createConnect` identifies VectorMojo with its public OAuth `client_id`.
2. `signInPopup()` performs Authorization Code + PKCE through the current AEGIS
   issuer at `https://accounts.connections.icu`.
3. The SDK persists and rotation-safely refreshes the user's session.
4. VectorMojo uses the authenticated state only to unlock unlimited local
   conversions. Artwork is never sent to Connections.
5. Sign-out revokes the Connections grant as well as clearing the local
   session.

The `client_id` in `src/lib/connections.ts` is public by OAuth design. The
developer API key used once to create and manage that registration is a secret
and must never be placed in the source tree, a Vite environment variable, or a
browser bundle.

## Guest allowance

Guests receive ten successful conversions per browser. The count lives in
`localStorage`, with an in-memory fallback for storage-restricted tabs.
Unsupported files and failed conversions do not consume an allowance.

This is intentionally a lightweight product gate rather than fingerprinting.
Making an anonymous quota resistant to storage clearing would require a backend
or invasive device identification, both of which conflict with VectorMojo's
private, static architecture. A Connections session is the durable identity
boundary and currently unlocks unlimited use.
