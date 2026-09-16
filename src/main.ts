import { createApp } from 'vue'
import App from './App.vue'
import { sendVisitPing } from './lib/analytics'
import { installImeCompositionGuard } from './lib/ime-composition-guard'
import './style.css'

installImeCompositionGuard()

createApp(App).mount('#app')

sendVisitPing()
