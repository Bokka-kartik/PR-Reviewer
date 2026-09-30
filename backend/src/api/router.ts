import { timingSafeEqual } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import type { ReviewStatus, ReviewStore } from '../store/types.js'
import { computeStats } from './stats.js'

const STATUSES: ReviewStatus[] = ['running', 'completed', 'skipped', 'failed']
const STATS_WINDOW = 1000

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function apiRouter(store: ReviewStore, dashboardToken: string): Router {
  const router = Router()

  router.use((req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    if (!token || !tokenMatches(token, dashboardToken)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  })

  router.get('/stats', async (_req, res) => {
    res.json(computeStats(await store.recent(STATS_WINDOW)))
  })

  router.get('/reviews', async (req, res) => {
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined
    if (status && !STATUSES.includes(status as ReviewStatus)) {
      res.status(400).json({ error: 'Invalid status' })
      return
    }
    const repo = typeof req.query['repo'] === 'string' ? req.query['repo'] : undefined
    const limit = Math.min(Math.max(Number(req.query['limit']) || 20, 1), 100)
    const page = Math.max(Number(req.query['page']) || 1, 1)

    const { items, total } = await store.list({
      repo,
      status: status as ReviewStatus | undefined,
      limit,
      skip: (page - 1) * limit,
    })
    // The list view does not need every comment body.
    res.json({
      total,
      page,
      limit,
      items: items.map(({ comments, ...rest }) => ({ ...rest, commentCount: comments.length })),
    })
  })

  router.get('/reviews/:id', async (req, res) => {
    const review = await store.get(String(req.params['id']))
    if (!review) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(review)
  })

  return router
}
