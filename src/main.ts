import { createApp } from 'vue'
import App from './App.vue'
import { sendVisitPing } from './lib/analytics'
import './style.css'

createApp(App).mount('#app')

sendVisitPing()
