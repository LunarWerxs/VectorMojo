<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  ConnectError,
  connections,
  type ConnectUser,
} from './lib/connections'
import { detect, type Detected } from './lib/detect'
import {
  GUEST_CONVERSION_LIMIT,
  guestConversionsRemaining,
  readGuestConversionCount,
  recordGuestConversion,
} from './lib/guest-usage'
import { converterFor, type ToSvgResult } from './lib/registry'
import {
  download,
  formatSvgForExport,
  optimizeSvg,
  pngDimensionsFromSvg,
  svgToPdf,
  svgToPng,
  svgWithBackground,
} from './lib/outputs'

type Status = 'detecting' | 'converting' | 'done' | 'unsupported' | 'error'

interface Item {
  id: number
  name: string
  size: number
  detected: Detected
  status: Status
  svg?: string
  warnings: string[]
  error?: string
  layers?: number
  summary?: string
  pages?: number
  page?: number
  source?: ArrayBuffer
  pageLoading?: boolean
  transparentBackground: boolean
  precision: number
  minify: boolean
  pngWidth: number
  pngHeight: number
  pngAspectRatio: number
  lockPngAspect: boolean
  copied?: boolean
}

const items = ref<Item[]>([])
const dragging = ref(false)
const helpDialog = ref<HTMLDialogElement | null>(null)
const accountDialog = ref<HTMLDialogElement | null>(null)
const connectionsUser = ref<ConnectUser | null>(null)
const connectionsBusy = ref(false)
const connectionsError = ref('')
const guestConversionCount = ref(readGuestConversionCount())
const pendingFiles = ref<File[]>([])
const brandMarkUrl = `${import.meta.env.BASE_URL}vectormojo-mark.svg`
const noticesUrl = `${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`
const sourceUrl = 'https://github.com/LunarWerxs/vectormojo'
const helpSeenKey = 'vectormojo:help-seen:v1'
let seq = 0
let connectionsRestorePromise: Promise<void> | null = null

const baseName = (n: string) => n.replace(/\.[^.]+$/, '')

function openHelp() {
  if (!helpDialog.value?.open) helpDialog.value?.showModal()
}

function rememberHelpSeen() {
  try {
    localStorage.setItem(helpSeenKey, 'yes')
  } catch {
    // Storage can be unavailable in strict privacy modes; the dialog still works.
  }
}

function closeHelp() {
  rememberHelpSeen()
  helpDialog.value?.close()
}

function openAccountDialog() {
  if (!accountDialog.value?.open) accountDialog.value?.showModal()
}

function closeAccountDialog() {
  pendingFiles.value = []
  connectionsError.value = ''
  accountDialog.value?.close()
}

async function restoreConnectionsSession() {
  try {
    if (await connections.isSignedIn()) {
      connectionsUser.value = await connections.getUser()
    }
  } catch {
    // A revoked or expired session should behave like a cleanly signed-out app.
    await connections.signOut()
    connectionsUser.value = null
  }
}

function ensureConnectionsSessionRestored() {
  connectionsRestorePromise ??= restoreConnectionsSession()
  return connectionsRestorePromise
}

async function signInWithConnections() {
  connectionsBusy.value = true
  connectionsError.value = ''
  try {
    connectionsUser.value = await connections.signInDialog({
      appName: 'VectorMojo',
    })
    accountDialog.value?.close()
    const queued = pendingFiles.value.splice(0)
    if (queued.length) await addFiles(queued)
  } catch (err) {
    if (err instanceof ConnectError && err.code === 'cancelled') return
    connectionsError.value =
      err instanceof Error ? err.message : 'Connections sign-in did not complete.'
  } finally {
    connectionsBusy.value = false
  }
}

async function signOutOfConnections() {
  connectionsBusy.value = true
  connectionsError.value = ''
  try {
    await connections.signOut({ revoke: true })
    connectionsUser.value = null
  } finally {
    connectionsBusy.value = false
  }
}

async function trySampleFromHelp() {
  closeHelp()
  await trySample()
}

onMounted(() => {
  try {
    if (localStorage.getItem(helpSeenKey) !== 'yes') openHelp()
  } catch {
    openHelp()
  }
  void ensureConnectionsSessionRestored()
})

function applyResult(item: Item, result: ToSvgResult) {
  item.svg = optimizeSvg(result.svg)
  const dimensions = pngDimensionsFromSvg(item.svg)
  item.pngWidth = dimensions.width
  item.pngHeight = dimensions.height
  item.pngAspectRatio = dimensions.width / dimensions.height
  item.warnings = result.warnings
  item.layers = result.meta.layers as number | undefined
  item.pages = result.meta.pages as number | undefined
  item.page = result.meta.page as number | undefined
  item.summary =
    (result.meta.summary as string | undefined) ??
    (item.layers === undefined ? 'converted' : `${item.layers} shapes`)
}

async function addFiles(files: FileList | File[]) {
  await ensureConnectionsSessionRestored()
  const incoming = Array.from(files)
  for (let index = 0; index < incoming.length; index += 1) {
    const file = incoming[index] as File
    if (
      !connectionsUser.value &&
      guestConversionCount.value >= GUEST_CONVERSION_LIMIT
    ) {
      pendingFiles.value.push(...incoming.slice(index))
      openAccountDialog()
      break
    }
    // reactive() so later mutations (status/svg) go through Vue's proxy and
    // trigger re-renders; a raw object reference would update silently.
    const item = reactive<Item>({
      id: seq++,
      name: file.name,
      size: file.size,
      detected: { format: 'unknown', label: '…', supported: false },
      status: 'detecting',
      warnings: [],
      transparentBackground: true,
      precision: 2,
      minify: true,
      pngWidth: 1,
      pngHeight: 1,
      pngAspectRatio: 1,
      lockPngAspect: true,
    })
    items.value.unshift(item)
    try {
      const bytes = await file.arrayBuffer()
      item.detected = detect(bytes, file.name)
      const conv = item.detected.supported ? converterFor(item.detected.format) : undefined
      if (!conv) {
        item.status = 'unsupported'
        continue
      }
      item.status = 'converting'
      const res = await conv(bytes)
      applyResult(item, res)
      if ((item.pages ?? 0) > 1) item.source = bytes
      item.status = 'done'
      if (!connectionsUser.value) {
        guestConversionCount.value = recordGuestConversion()
      }
    } catch (err) {
      item.status = 'error'
      item.error = err instanceof Error ? err.message : String(err)
    }
  }
}

async function changePage(item: Item, event: Event) {
  const select = event.target as HTMLSelectElement
  const requestedPage = Number(select.value)
  if (
    !item.source ||
    !Number.isInteger(requestedPage) ||
    requestedPage === item.page
  ) {
    return
  }

  const converter = converterFor(item.detected.format)
  if (!converter) return
  item.pageLoading = true
  item.error = undefined
  try {
    applyResult(item, await converter(item.source, { page: requestedPage - 1 }))
  } catch (err) {
    select.value = String(item.page)
    item.error =
      'Page change failed: ' + (err instanceof Error ? err.message : String(err))
  } finally {
    item.pageLoading = false
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFiles(input.files)
  input.value = ''
}

async function trySample() {
  try {
    const res = await fetch('./samples/vector-mojo-sample.psd')
    if (!res.ok) throw new Error(`sample not found (${res.status})`)
    const blob = await res.blob()
    await addFiles([new File([blob], 'vector-mojo-sample.psd')])
  } catch (err) {
    alert('Sample unavailable: ' + (err instanceof Error ? err.message : err))
  }
}

async function exportSvg(item: Item) {
  if (!item.svg) throw new Error('No SVG is available to export.')
  const artwork = item.transparentBackground ? item.svg : svgWithBackground(item.svg)
  return formatSvgForExport(artwork, item.precision, item.minify)
}

async function downloadSvg(item: Item) {
  try {
    item.error = undefined
    download(await exportSvg(item), baseName(item.name) + '.svg')
  } catch (err) {
    item.error = 'SVG export failed: ' + (err instanceof Error ? err.message : String(err))
  }
}

async function downloadPng(item: Item) {
  if (!item.svg) return
  try {
    item.error = undefined
    const svg = await exportSvg(item)
    const blob = await svgToPng(
      svg,
      { width: item.pngWidth, height: item.pngHeight },
      item.transparentBackground ? undefined : '#ffffff',
    )
    download(
      blob,
      `${baseName(item.name)}-${Math.round(item.pngWidth)}x${Math.round(item.pngHeight)}.png`,
      'image/png',
    )
  } catch (err) {
    item.error = 'PNG export failed: ' + (err instanceof Error ? err.message : String(err))
  }
}

async function downloadPdf(item: Item) {
  if (!item.svg) return
  try {
    item.error = undefined
    const blob = await svgToPdf(await exportSvg(item))
    download(blob, baseName(item.name) + '.pdf', 'application/pdf')
  } catch (err) {
    item.error = 'PDF export failed: ' + (err instanceof Error ? err.message : String(err))
  }
}

async function copySvg(item: Item) {
  try {
    item.error = undefined
    const svg = await exportSvg(item)
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(svg)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = svg
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      if (!copied) throw new Error('Clipboard access is unavailable.')
    }
    item.copied = true
    setTimeout(() => {
      item.copied = false
    }, 1500)
  } catch (err) {
    item.error = 'Copy failed: ' + (err instanceof Error ? err.message : String(err))
  }
}

function updatePngWidth(item: Item, event: Event) {
  const width = Math.max(1, Math.round(Number((event.target as HTMLInputElement).value)))
  item.pngWidth = Number.isFinite(width) ? width : 1
  if (item.lockPngAspect) {
    item.pngHeight = Math.max(1, Math.round(item.pngWidth / item.pngAspectRatio))
  }
}

function updatePngHeight(item: Item, event: Event) {
  const height = Math.max(1, Math.round(Number((event.target as HTMLInputElement).value)))
  item.pngHeight = Number.isFinite(height) ? height : 1
  if (item.lockPngAspect) {
    item.pngWidth = Math.max(1, Math.round(item.pngHeight * item.pngAspectRatio))
  }
}

function remove(id: number) {
  items.value = items.value.filter((i) => i.id !== id)
}

const kb = (n: number) => (n < 1024 ? n + ' B' : (n / 1024).toFixed(0) + ' KB')
const guestRemaining = computed(() =>
  guestConversionsRemaining(guestConversionCount.value),
)
const accountName = computed(() =>
  String(connectionsUser.value?.name || 'Connections member'),
)
</script>

<template>
  <div class="min-h-full bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <div class="mx-auto max-w-5xl px-5 py-10">
      <header class="mb-8">
        <!-- Up to the studio. VectorMojo serves from a lunarwerx.com subdomain,
             and this is the only route back to the parent site. It sits above
             the product mark rather than beside it so the hierarchy reads in
             the order it actually is: studio, then product. -->
        <a
          href="https://lunarwerx.com/"
          class="mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          LunarWerx Studios
        </a>

        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <img :src="brandMarkUrl" alt="" class="h-10 w-10" />
            <div>
              <h1 class="text-2xl font-semibold tracking-tight">
                Vector<span class="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">Mojo</span>
              </h1>
              <p class="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                The file stays with you. The useful version comes out.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <div
              v-if="connectionsUser"
              class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/50"
            >
              <span class="font-medium text-emerald-700 dark:text-emerald-300">
                {{ accountName }} · unlimited
              </span>
              <button
                type="button"
                class="text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
                :disabled="connectionsBusy"
                @click="signOutOfConnections"
              >
                Sign out
              </button>
            </div>
            <button
              v-else
              type="button"
              class="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600 disabled:opacity-60"
              :disabled="connectionsBusy"
              @click="signInWithConnections"
            >
              {{ connectionsBusy ? 'Connecting…' : 'Sign in for unlimited' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm hover:border-indigo-400 hover:text-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
              @click="openHelp"
            >
              What can I do here?
            </button>
          </div>
        </div>
        <p
          v-if="connectionsError"
          class="mt-3 text-right text-xs text-red-500"
          role="alert"
        >
          {{ connectionsError }}
        </p>
      </header>

      <section class="mb-6 max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
          Design file in. Useful asset out.
        </p>
        <h2 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Turn the file you have into the vector you need.
        </h2>
        <p class="mt-3 text-base leading-7 text-neutral-600 dark:text-neutral-300">
          Drop in a Photoshop, PDF, Illustrator, EPS, SVG, PNG, or JPEG file.
          VectorMojo opens it in your browser, turns it into SVG, and lets you
          download SVG, PNG, or PDF—or copy the SVG straight into your project.
        </p>
      </section>

      <!-- Drop zone -->
      <label
        class="block cursor-pointer rounded-2xl border-2 border-dashed bg-white p-10 text-center shadow-sm transition dark:bg-neutral-900"
        :class="
          dragging
            ? 'border-indigo-500 bg-indigo-500/5'
            : 'border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600'
        "
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input type="file" class="hidden" multiple @change="onPick" />
        <div class="text-base">
          <span class="font-semibold">Drop a design file here</span>
          <span class="text-neutral-500 dark:text-neutral-400"> or click to choose one</span>
        </div>
        <div class="mt-2 text-xs text-neutral-400">
          PSD · PDF · AI · EPS · SVG · approximate PNG/JPG tracing
        </div>
        <button
          type="button"
          class="mt-4 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          @click.prevent="trySample"
        >
          No file handy? Try the sample
        </button>
      </label>

      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p v-if="connectionsUser" class="text-emerald-600 dark:text-emerald-400">
          Connected through Connections. Convert as many files as you like.
        </p>
        <p v-else class="text-neutral-500 dark:text-neutral-400">
          {{ guestRemaining }} of {{ GUEST_CONVERSION_LIMIT }} free guest conversions remaining
          in this browser. A free Connections account unlocks unlimited use.
        </p>
        <button
          v-if="!connectionsUser"
          type="button"
          class="font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          :disabled="connectionsBusy"
          @click="signInWithConnections"
        >
          Continue with Connections
        </button>
      </div>

      <section class="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Common uses">
        <article class="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p class="text-sm font-semibold">Rescue the vector</p>
          <p class="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            Pull editable shapes out of a PSD, PDF, modern AI, or EPS file.
          </p>
        </article>
        <article class="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p class="text-sm font-semibold">Make it web-ready</p>
          <p class="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            Clean up an SVG, choose its precision, and copy the markup.
          </p>
        </article>
        <article class="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p class="text-sm font-semibold">Export what you need</p>
          <p class="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            Save the result as SVG, transparent PNG, white PNG, or PDF.
          </p>
        </article>
      </section>

      <!-- Results -->
      <ul class="mt-6 space-y-4">
        <li
          v-for="item in items"
          :key="item.id"
          class="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div class="flex items-start gap-4 p-4">
            <!-- Preview -->
            <div
              class="checker flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800"
            >
              <div
                v-if="item.svg"
                class="max-h-full max-w-full [&>svg]:max-h-24 [&>svg]:max-w-24"
                v-html="item.svg"
              />
              <span v-else class="text-2xl">📄</span>
            </div>

            <!-- Meta -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ item.name }}</span>
                <span class="text-xs text-neutral-400">{{ kb(item.size) }}</span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span
                  class="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {{ item.detected.label }}
                </span>
                <span v-if="item.status === 'done'" class="text-emerald-600 dark:text-emerald-400">
                  ✓ {{ item.summary }} → SVG
                </span>
                <span v-else-if="item.status === 'converting'" class="text-indigo-500">
                  converting…
                </span>
                <span v-else-if="item.status === 'detecting'" class="text-neutral-400">
                  reading…
                </span>
                <span v-else-if="item.status === 'unsupported'" class="text-amber-600">
                  not supported yet
                </span>
                <span v-else-if="item.status === 'error'" class="text-red-500">
                  error
                </span>
              </div>

              <p
                v-if="item.detected.note && item.status === 'unsupported'"
                class="mt-2 text-xs text-neutral-500"
              >
                {{ item.detected.note }}
              </p>
              <p v-if="item.error" class="mt-2 text-xs text-red-500">{{ item.error }}</p>
              <ul v-if="item.warnings.length" class="mt-2 space-y-0.5">
                <li v-for="(w, i) in item.warnings" :key="i" class="text-xs text-amber-600">
                  ⚠ {{ w }}
                </li>
              </ul>
              <div
                v-if="item.pages && item.pages > 1"
                class="mt-2 flex items-center gap-2 text-xs text-neutral-500"
              >
                <label :for="`page-${item.id}`">Page</label>
                <select
                  :id="`page-${item.id}`"
                  :value="item.page"
                  :disabled="item.pageLoading"
                  class="rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 dark:border-neutral-700"
                  @change="changePage(item, $event)"
                >
                  <option v-for="page in item.pages" :key="page" :value="page">
                    {{ page }} of {{ item.pages }}
                  </option>
                </select>
                <span v-if="item.pageLoading" class="text-indigo-500">rendering…</span>
              </div>
              <div
                v-if="item.status === 'done'"
                class="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500"
              >
                <label class="flex items-center gap-1.5">
                  Background
                  <select
                    v-model="item.transparentBackground"
                    class="rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 dark:border-neutral-700"
                  >
                    <option :value="true">Transparent</option>
                    <option :value="false">White</option>
                  </select>
                </label>
                <label class="flex items-center gap-1.5">
                  Precision
                  <select
                    v-model.number="item.precision"
                    class="rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 dark:border-neutral-700"
                  >
                    <option v-for="digits in [0, 1, 2, 3, 4]" :key="digits" :value="digits">
                      {{ digits }} decimals
                    </option>
                  </select>
                </label>
                <label class="flex items-center gap-1.5">
                  <input v-model="item.minify" type="checkbox" />
                  Minify SVG
                </label>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span>PNG dimensions</span>
                  <input
                    :value="item.pngWidth"
                    type="number"
                    min="1"
                    max="32767"
                    inputmode="numeric"
                    :aria-label="`PNG width for ${item.name}`"
                    class="w-20 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 dark:border-neutral-700"
                    @input="updatePngWidth(item, $event)"
                  />
                  <span aria-hidden="true">×</span>
                  <input
                    :value="item.pngHeight"
                    type="number"
                    min="1"
                    max="32767"
                    inputmode="numeric"
                    :aria-label="`PNG height for ${item.name}`"
                    class="w-20 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 dark:border-neutral-700"
                    @input="updatePngHeight(item, $event)"
                  />
                  <span>px</span>
                  <label class="ml-1 flex items-center gap-1">
                    <input v-model="item.lockPngAspect" type="checkbox" />
                    Lock ratio
                  </label>
                </div>
              </div>

              <!-- Actions -->
              <div v-if="item.status === 'done'" class="mt-3 flex flex-wrap gap-2">
                <button
                  class="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
                  @click="downloadSvg(item)"
                >
                  Download SVG
                </button>
                <button
                  class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  @click="downloadPng(item)"
                >
                  PNG {{ Math.round(item.pngWidth) }}×{{ Math.round(item.pngHeight) }}
                </button>
                <button
                  class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  @click="downloadPdf(item)"
                >
                  Download PDF
                </button>
                <button
                  class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  @click="copySvg(item)"
                >
                  {{ item.copied ? 'Copied!' : 'Copy SVG' }}
                </button>
              </div>
            </div>

            <button
              class="shrink-0 text-neutral-400 hover:text-red-500"
              title="Remove"
              @click="remove(item.id)"
            >
              ✕
            </button>
          </div>
        </li>
      </ul>

      <footer class="mt-10 text-center text-xs text-neutral-400">
        Runs 100% locally · static-hostable on Cloudflare / GitHub Pages ·
        <a
          :href="noticesUrl"
          class="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-300"
          target="_blank"
          rel="noreferrer"
        >
          third-party notices
        </a>
        ·
        <a
          :href="sourceUrl"
          class="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-300"
          target="_blank"
          rel="noreferrer"
        >
          source code
        </a>
      </footer>
    </div>

    <dialog
      ref="helpDialog"
      class="help-dialog w-[min(92vw,46rem)] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      aria-labelledby="help-title"
      @close="rememberHelpSeen"
      @click.self="closeHelp"
    >
      <div class="p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
              Your local conversion bench
            </p>
            <h2 id="help-title" class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              What can VectorMojo do for me?
            </h2>
          </div>
          <button
            type="button"
            class="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Close help"
            autofocus
            @click="closeHelp"
          >
            ✕
          </button>
        </div>

        <p class="mt-4 leading-7 text-neutral-600 dark:text-neutral-300">
          VectorMojo takes artwork trapped in a design file and gives you a
          practical SVG you can edit, ship, paste into a website, or export
          again—without sending the original file to a server.
        </p>

        <ol class="mt-6 grid gap-3 sm:grid-cols-3">
          <li class="rounded-xl bg-neutral-100 p-4 dark:bg-neutral-800">
            <span class="text-xs font-semibold text-indigo-500">01 · Drop</span>
            <p class="mt-2 text-sm leading-6">Choose one file or a whole batch.</p>
          </li>
          <li class="rounded-xl bg-neutral-100 p-4 dark:bg-neutral-800">
            <span class="text-xs font-semibold text-indigo-500">02 · Convert</span>
            <p class="mt-2 text-sm leading-6">Everything is read and converted in this tab.</p>
          </li>
          <li class="rounded-xl bg-neutral-100 p-4 dark:bg-neutral-800">
            <span class="text-xs font-semibold text-indigo-500">03 · Take it</span>
            <p class="mt-2 text-sm leading-6">Download SVG, PNG, PDF, or copy the SVG.</p>
          </li>
        </ol>

        <div class="mt-6 grid gap-5 border-t border-neutral-200 pt-6 text-sm dark:border-neutral-700 sm:grid-cols-2">
          <div>
            <h3 class="font-semibold">Good at</h3>
            <ul class="mt-2 space-y-1.5 text-neutral-600 dark:text-neutral-300">
              <li>• Logos and shape layers from PSD/PSB</li>
              <li>• Vector pages from PDF, modern AI, and EPS</li>
              <li>• Cleaning and normalizing existing SVG</li>
              <li>• Quick bitmap tracing when “close enough” works</li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold">Worth knowing</h3>
            <ul class="mt-2 space-y-1.5 text-neutral-600 dark:text-neutral-300">
              <li>• PNG/JPEG tracing is an approximation</li>
              <li>• Older non-PDF Illustrator files are not supported</li>
              <li>• Raster and text appearance may remain embedded pixels</li>
              <li>• Nothing is uploaded or stored by VectorMojo</li>
            </ul>
          </div>
        </div>

        <div class="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            class="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
            @click="trySampleFromHelp"
          >
            Show me with the sample
          </button>
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            @click="closeHelp"
          >
            Got it—let me drop a file
          </button>
        </div>
      </div>
    </dialog>

    <dialog
      ref="accountDialog"
      class="help-dialog w-[min(92vw,32rem)] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      aria-labelledby="account-title"
      @cancel.prevent="closeAccountDialog"
      @click.self="closeAccountDialog"
    >
      <div class="p-6 sm:p-8">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
          Keep converting for free
        </p>
        <h2 id="account-title" class="mt-2 text-2xl font-semibold tracking-tight">
          You’ve used your 10 guest conversions.
        </h2>
        <p class="mt-4 leading-7 text-neutral-600 dark:text-neutral-300">
          Create or sign in to a free Connections account to continue with
          unlimited conversions. Your design files still stay entirely inside
          this browser tab.
        </p>
        <p
          v-if="connectionsError"
          class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {{ connectionsError }}
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            class="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
            :disabled="connectionsBusy"
            @click="signInWithConnections"
          >
            {{ connectionsBusy ? 'Connecting…' : 'Continue with Connections' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            :disabled="connectionsBusy"
            @click="closeAccountDialog"
          >
            Not now
          </button>
        </div>
      </div>
    </dialog>
  </div>
</template>
