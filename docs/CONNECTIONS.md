# Connections integration

VectorMojo is a static browser application. It pilots `@cnct/connect`
1.3.0-beta.2's SDK-owned sign-in dialog from the checked-in package under
`vendor/`. It keeps authorization inside the dialog's cross-origin
Connections-owned iframe rather than opening a browser popup or adding a
backend/application-owned callback route:

1. `createConnect` identifies VectorMojo with its public OAuth `client_id`.
2. `signInDialog({ appName: "VectorMojo" })` injects the Connections handoff
   dialog and performs Authorization Code + PKCE through the current AEGIS
   issuer at `https://accounts.connections.icu`. The password and consent UI
   remain in the secure Connections-owned iframe.
3. The SDK persists and rotation-safely refreshes the user's session.
4. VectorMojo uses the authenticated state only to unlock unlimited local
   conversions. Artwork is never sent to Connections.
5. Sign-out revokes the Connections grant as well as clearing the local
   session.

The prerelease tarball is temporary pilot packaging, not a fork of the SDK. Once
the dialog is approved, replace it with the stable registry version and remove
`vendor/cnct-connect-1.3.0-beta.2.tgz`.

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
