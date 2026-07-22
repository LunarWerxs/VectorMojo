<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { detect, type Detected } from './lib/detect'
import { converterFor } from './lib/registry'
import { optimizeSvg, svgToPng, download } from './lib/outputs'

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
}

const items = ref<Item[]>([])
const dragging = ref(false)
const pngScale = ref(2)
let seq = 0

const baseName = (n: string) => n.replace(/\.[^.]+$/, '')

async function addFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    // reactive() so later mutations (status/svg) go through Vue's proxy and
    // trigger re-renders; a raw object reference would update silently.
    const item = reactive<Item>({
      id: seq++,
      name: file.name,
      size: file.size,
      detected: { format: 'unknown', label: '…', supported: false },
      status: 'detecting',
      warnings: [],
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
      item.svg = optimizeSvg(res.svg)
      item.warnings = res.warnings
      item.layers = res.meta.layers as number | undefined
      item.status = 'done'
    } catch (err) {
      item.status = 'error'
      item.error = err instanceof Error ? err.message : String(err)
    }
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
    const res = await fetch('./samples/chat.psd')
    if (!res.ok) throw new Error(`sample not found (${res.status})`)
    const blob = await res.blob()
    await addFiles([new File([blob], 'chat.psd')])
  } catch (err) {
    alert('Sample unavailable: ' + (err instanceof Error ? err.message : err))
  }
}

function downloadSvg(item: Item) {
  if (item.svg) download(item.svg, baseName(item.name) + '.svg')
}

async function downloadPng(item: Item) {
  if (!item.svg) return
  try {
    const blob = await svgToPng(item.svg, pngScale.value)
    download(blob, baseName(item.name) + '.png', 'image/png')
  } catch (err) {
    item.error = 'PNG export failed: ' + (err instanceof Error ? err.message : String(err))
  }
}

function remove(id: number) {
  items.value = items.value.filter((i) => i.id !== id)
}

const kb = (n: number) => (n < 1024 ? n + ' B' : (n / 1024).toFixed(0) + ' KB')
const doneCount = computed(() => items.value.filter((i) => i.status === 'done').length)
</script>

<template>
  <div class="min-h-full bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <div class="mx-auto max-w-5xl px-5 py-10">
      <header class="mb-8">
        <h1 class="text-2xl font-semibold tracking-tight">
          Vector<span class="text-indigo-500">Mojo</span>
        </h1>
        <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Design files → clean SVG, entirely in your browser. Nothing is uploaded.
        </p>
      </header>

      <!-- Drop zone -->
      <label
        class="block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition"
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
        <div class="text-sm">
          <span class="font-medium">Drop files</span>
          <span class="text-neutral-500 dark:text-neutral-400"> or click to browse</span>
        </div>
        <div class="mt-2 text-xs text-neutral-400">
          PSD ready now · PDF · AI · EPS · SVG · PNG landing next
        </div>
        <button
          type="button"
          class="mt-4 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          @click.prevent="trySample"
        >
          Try a sample PSD
        </button>
      </label>

      <!-- PNG scale control -->
      <div v-if="doneCount" class="mt-4 flex items-center gap-2 text-xs text-neutral-500">
        <span>PNG export scale</span>
        <select
          v-model.number="pngScale"
          class="rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 dark:border-neutral-700"
        >
          <option :value="1">1×</option>
          <option :value="2">2×</option>
          <option :value="4">4×</option>
        </select>
      </div>

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
                  ✓ {{ item.layers }} shapes → SVG
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

              <!-- Actions -->
              <div v-if="item.status === 'done'" class="mt-3 flex gap-2">
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
                  PNG {{ pngScale }}×
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
        Runs 100% locally · static-hostable on Cloudflare / GitHub Pages
      </footer>
    </div>
  </div>
</template>
