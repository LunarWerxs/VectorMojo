import { createApp, createSSRApp } from 'vue'
import App from './App.vue'
import { sendVisitPing } from './lib/analytics'
import { installImeCompositionGuard } from './lib/ime-composition-guard'
import './style.css'

installImeCompositionGuard()

// The build prerenders the first view into #app (tools/prerender.ts), so a
// built page hydrates that HTML instead of painting it again; the dev server
// serves an empty #app and renders from scratch.
const app = import.meta.env.DEV ? createApp(App) : createSSRApp(App)
app.mount('#app')

sendVisitPing()
