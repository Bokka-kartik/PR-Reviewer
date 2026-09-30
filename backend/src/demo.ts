import { Webhooks } from '@octokit/webhooks'
import { createApp } from './app.js'
import { seedDemoStore } from './demo/seed.js'
import { consoleLogger as log } from './log.js'
import { MemoryReviewStore } from './store/memory.js'

// Demo mode: the real API and dashboard endpoints on top of fake, in-memory data.
// No GitHub App, Anthropic key or MongoDB needed. Data resets every time it starts.
const PORT = Number(process.env['PORT'] ?? 3001)
const TOKEN = process.env['DASHBOARD_TOKEN'] ?? 'demo-token-1234567890'

const store = new MemoryReviewStore()
const count = await seedDemoStore(store)

// Webhook deliveries are rejected in demo mode (nobody knows this random secret).
const webhooks = new Webhooks({ secret: crypto.randomUUID() })
createApp({ webhooks, store, dashboardToken: TOKEN, log }).listen(PORT, () => {
  console.log(`\nDemo backend running on http://localhost:${PORT} with ${count} fake reviews.`)
  console.log(`Start the dashboard in another terminal:  npm run dev:frontend`)
  console.log(`Then open http://localhost:5173 and sign in with the token:  ${TOKEN}\n`)
})
