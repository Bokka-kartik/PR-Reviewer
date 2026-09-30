import mongoose from 'mongoose'
import { afterAll, describe, expect, it } from 'vitest'
import { connectMongo, MongoReviewStore } from '../src/store/mongo.js'
import { MemoryReviewStore } from '../src/store/memory.js'
import { STALE_RUNNING_MS } from '../src/store/types.js'
import { storeContract } from './storeContract.js'

storeContract('memory', () => new MemoryReviewStore())

describe('memory store', () => {
  it('takes over a running review that has been stuck longer than the stale limit', async () => {
    let now = new Date('2026-01-01T00:00:00Z')
    const store = new MemoryReviewStore(() => now)
    const key = { owner: 'o', repo: 'r', prNumber: 1, headSha: 's' }
    const meta = { prTitle: 't', prUrl: 'u', author: 'a' }

    await store.claim(key, meta)
    now = new Date(now.getTime() + STALE_RUNNING_MS - 1000)
    expect(await store.claim(key, meta)).toBeNull()

    now = new Date(now.getTime() + 2000)
    expect(await store.claim(key, meta)).not.toBeNull()
  })
})

// Needs a real MongoDB. CI provides one; locally set MONGO_TEST_URI to run it.
const mongoUri = process.env['MONGO_TEST_URI']
storeContract(
  'mongo',
  async () => {
    if (mongoose.connection.readyState === 0) await connectMongo(mongoUri!)
    return new MongoReviewStore()
  },
  { skip: !mongoUri },
)

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
})
