import { Webhooks } from '@octokit/webhooks'
import mongoose from 'mongoose'
import { App } from 'octokit'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { githubClient } from './github/client.js'
import { registerHandlers } from './github/webhooks.js'
import { consoleLogger as log } from './log.js'
import { JobQueue } from './queue.js'
import { AnthropicReviewer } from './review/anthropic.js'
import { connectMongo, MongoReviewStore } from './store/mongo.js'

async function main() {
  const config = loadConfig()

  await connectMongo(config.MONGO_URI)
  log.info('connected to MongoDB')

  const githubApp = new App({
    appId: config.GITHUB_APP_ID,
    privateKey: config.privateKeyPem,
    webhooks: { secret: config.GITHUB_WEBHOOK_SECRET },
  })
  const webhooks = new Webhooks({ secret: config.GITHUB_WEBHOOK_SECRET })
  const queue = new JobQueue(config.REVIEW_CONCURRENCY, log)
  const store = new MongoReviewStore()

  registerHandlers(webhooks, {
    getGitHub: async (installationId) => githubClient(await githubApp.getInstallationOctokit(installationId)),
    review: {
      llm: new AnthropicReviewer(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL),
      store,
      log,
      maxDiffChars: config.MAX_DIFF_CHARS,
      allowedAuthors: config.ALLOWED_AUTHORS,
      requireLabel: config.REQUIRE_LABEL,
    },
    queue,
    log,
    requireLabel: config.REQUIRE_LABEL,
  })

  const app = createApp({ webhooks, store, dashboardToken: config.DASHBOARD_TOKEN, log })
  const server = app.listen(config.PORT, () => log.info('listening', { port: config.PORT }))

  const shutdown = async (signal: string) => {
    log.info('shutting down', { signal, pendingReviews: queue.pending })
    server.close()
    // Give running reviews a chance to finish before the process exits.
    await Promise.race([queue.onIdle(), new Promise((resolve) => setTimeout(resolve, 30_000))])
    await mongoose.disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((e) => {
  log.error('fatal startup error', { error: e instanceof Error ? e.message : String(e) })
  process.exit(1)
})
