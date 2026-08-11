/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

// Build-time version stamp, defined in vite.config.ts from package.json.
declare const __APP_VERSION__: string
