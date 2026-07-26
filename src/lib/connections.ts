import { ConnectError, createConnect, type ConnectUser } from '@cnct/connect'

// Public OAuth client ID for VectorMojo's PKCE-only browser app. This identifies
// the app; it is not a secret. The developer API key used to register it never
// belongs in this repository or in the browser bundle.
export const connections = createConnect({
  clientId: '77f783a3ad15e5e8fb990fe9c558a39f',
  scopes: ['openid', 'profile', 'photo'],
})

export { ConnectError }
export type { ConnectUser }
