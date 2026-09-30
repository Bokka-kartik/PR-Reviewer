import type { Logger } from './log.js'

/**
 * Minimal in-process job queue with bounded concurrency. Webhook handlers must answer
 * GitHub within 10 seconds, but a review takes longer, so the handler enqueues and returns.
 *
 * Limitation: jobs live in memory, so a crash loses queued work. The store's "claim"
 * makes a redelivered webhook safe to retry; see README for the production alternative.
 */
export class JobQueue {
  private running = 0
  private readonly waiting: (() => Promise<void>)[] = []
  private idleResolvers: (() => void)[] = []

  constructor(
    private readonly concurrency: number,
    private readonly log: Logger,
  ) {}

  add(name: string, job: () => Promise<unknown>): void {
    this.waiting.push(async () => {
      try {
        await job()
      } catch (e) {
        this.log.error('job failed', { name, error: e instanceof Error ? e.message : String(e) })
      }
    })
    this.drain()
  }

  get pending(): number {
    return this.waiting.length + this.running
  }

  /** Resolves when nothing is running or waiting. */
  onIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleResolvers.push(resolve))
  }

  private drain(): void {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const next = this.waiting.shift()!
      this.running++
      void next().finally(() => {
        this.running--
        this.drain()
        if (this.pending === 0) {
          const resolvers = this.idleResolvers
          this.idleResolvers = []
          for (const r of resolvers) r()
        }
      })
    }
  }
}
