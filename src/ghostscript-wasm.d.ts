declare module '@jspawn/ghostscript-wasm' {
  interface GhostscriptFileSystem {
    mkdir(path: string): void
    writeFile(path: string, data: Uint8Array): void
    readFile(path: string): Uint8Array
  }

  interface GhostscriptModule {
    FS: GhostscriptFileSystem
    callMain(args: string[]): number | Promise<number>
  }

  interface GhostscriptOptions {
    locateFile?: (path: string, prefix: string) => string
  }

  export default function createGhostscript(
    options?: GhostscriptOptions,
  ): Promise<GhostscriptModule>
}

declare module '@jspawn/ghostscript-wasm/gs.js' {
  interface GhostscriptFileSystem {
    mkdir(path: string): void
    writeFile(path: string, data: Uint8Array): void
    readFile(path: string): Uint8Array
  }

  interface GhostscriptModule {
    FS: GhostscriptFileSystem
    callMain(args: string[]): number | Promise<number>
  }

  interface GhostscriptOptions {
    locateFile?: (path: string, prefix: string) => string
  }

  export default function createGhostscript(
    options?: GhostscriptOptions,
  ): Promise<GhostscriptModule>
}
