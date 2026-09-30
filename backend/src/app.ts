import express, { type NextFunction, type Request, type Response } from 'express'
import type { Webhooks } from '@octokit/webhooks'
import { apiRouter } from './api/router.js'
import type { Logger } from './log.js'
import type { ReviewStore } from './store/types.js'

export interface AppDeps {
  webhooks: Webhooks
  store: ReviewStore
  dashboardToken: string
  log: Logger
}

export function createApp(deps: AppDeps) {
  const app = express()
  app.disable('x-powered-by')

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // The signature covers the exact bytes GitHub sent, so read the body raw.
  app.post('/webhook', express.raw({ type: '*/*', limit: '5mb' }), async (req: Request, res: Response) => {
    const id = req.header('x-github-delivery')
    const name = req.header('x-github-event')
    const signature = req.header('x-hub-signature-256')
    if (!id || !name || !signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: 'Missing GitHub webhook headers' })
      return
    }

    const payload = req.body.toString('utf8')
    if (!(await deps.webhooks.verify(payload, signature))) {
      deps.log.warn('webhook rejected: bad signature', { delivery: id })
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }

    await deps.webhooks.receive({ id, name, payload: parsed } as Parameters<Webhooks['receive']>[0])
    res.status(202).json({ ok: true })
  })

  app.use('/api', express.json(), apiRouter(deps.store, deps.dashboardToken))

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    deps.log.error('request failed', { error: err instanceof Error ? err.message : String(err) })
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
