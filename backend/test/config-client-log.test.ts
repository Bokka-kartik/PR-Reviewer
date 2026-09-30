import type { Octokit } from 'octokit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import { githubClient } from '../src/github/client.js'
import { consoleLogger } from '../src/log.js'

const validEnv = {
  GITHUB_APP_ID: '123',
  GITHUB_PRIVATE_KEY: '-----BEGIN KEY-----\\nabc\\n-----END KEY-----',
  GITHUB_WEBHOOK_SECRET: 'a-long-enough-secret',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  DASHBOARD_TOKEN: 'dashboard-token-1234',
}

describe('loadConfig', () => {
  it('reads required settings and applies defaults for the rest', () => {
    const c = loadConfig(validEnv)
    expect(c).toMatchObject({
      PORT: 3001,
      MONGO_URI: 'mongodb://localhost:27017/pr-reviewer',
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
      MAX_DIFF_CHARS: 300_000,
      REVIEW_CONCURRENCY: 2,
    })
  })

  it('turns \\n written on one line back into real line breaks in the private key', () => {
    expect(loadConfig(validEnv).privateKeyPem).toBe('-----BEGIN KEY-----\nabc\n-----END KEY-----')
  })

  it('converts numeric settings from strings', () => {
    const c = loadConfig({ ...validEnv, PORT: '8080', MAX_DIFF_CHARS: '1000', REVIEW_CONCURRENCY: '4' })
    expect([c.PORT, c.MAX_DIFF_CHARS, c.REVIEW_CONCURRENCY]).toEqual([8080, 1000, 4])
  })

  it('lists every missing or invalid setting in one error', () => {
    expect(() => loadConfig({})).toThrowError(
      /GITHUB_APP_ID[\s\S]*GITHUB_PRIVATE_KEY[\s\S]*ANTHROPIC_API_KEY[\s\S]*DASHBOARD_TOKEN/,
    )
  })

  it('rejects weak secrets and nonsense values', () => {
    expect(() => loadConfig({ ...validEnv, DASHBOARD_TOKEN: 'short' })).toThrowError(/DASHBOARD_TOKEN/)
    expect(() => loadConfig({ ...validEnv, GITHUB_WEBHOOK_SECRET: 'short' })).toThrowError(/GITHUB_WEBHOOK_SECRET/)
    expect(() => loadConfig({ ...validEnv, PORT: 'abc' })).toThrowError(/PORT/)
    expect(() => loadConfig({ ...validEnv, REVIEW_CONCURRENCY: '0' })).toThrowError(/REVIEW_CONCURRENCY/)
  })
})

function fakeOctokit() {
  const request = vi.fn()
  const createReview = vi.fn().mockResolvedValue({})
  const octokit = { request, rest: { pulls: { createReview } } } as unknown as Octokit
  return { client: githubClient(octokit), request, createReview }
}

describe('githubClient', () => {
  it('asks GitHub for the diff media type and returns the text', async () => {
    const { client, request } = fakeOctokit()
    request.mockResolvedValue({ data: 'diff --git a/x b/x\n' })

    expect(await client.getDiff('acme', 'widgets', 7)).toBe('diff --git a/x b/x\n')
    expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner: 'acme',
      repo: 'widgets',
      pull_number: 7,
      headers: { accept: 'application/vnd.github.diff' },
    })
  })

  it('reads a file at a specific ref as raw text', async () => {
    const { client, request } = fakeOctokit()
    request.mockResolvedValue({ data: 'enabled: true\n' })

    expect(await client.getFile('acme', 'widgets', '.pr-reviewer.yml', 'sha-1')).toBe('enabled: true\n')
    expect(request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/contents/{path}',
      expect.objectContaining({
        path: '.pr-reviewer.yml',
        ref: 'sha-1',
        headers: { accept: 'application/vnd.github.raw+json' },
      }),
    )
  })

  it('treats a missing file as "no config" but not other errors', async () => {
    const { client, request } = fakeOctokit()
    request.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
    expect(await client.getFile('a', 'b', 'x', 'ref')).toBeNull()

    request.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
    await expect(client.getFile('a', 'b', 'x', 'ref')).rejects.toThrow('Bad credentials')
  })

  it('returns null when the path is a directory rather than a file', async () => {
    const { client, request } = fakeOctokit()
    request.mockResolvedValue({ data: [{ name: 'a' }] })
    expect(await client.getFile('a', 'b', 'dir', 'ref')).toBeNull()
  })

  it('posts a COMMENT review with inline comments on the new side of the diff', async () => {
    const { client, createReview } = fakeOctokit()
    await client.createReview({
      owner: 'acme',
      repo: 'widgets',
      pullNumber: 7,
      commitId: 'sha-1',
      body: 'Summary',
      comments: [{ path: 'src/a.ts', line: 12, body: 'Check this' }],
    })
    expect(createReview).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      pull_number: 7,
      commit_id: 'sha-1',
      event: 'COMMENT',
      body: 'Summary',
      comments: [{ path: 'src/a.ts', line: 12, side: 'RIGHT', body: 'Check this' }],
    })
  })
})

describe('consoleLogger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes one JSON object per line, errors to stderr', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    consoleLogger.info('hello', { pr: 7 })
    consoleLogger.warn('careful')
    consoleLogger.error('boom', { code: 1 })

    const info = JSON.parse(out.mock.calls[0]![0] as string)
    expect(info).toMatchObject({ level: 'info', message: 'hello', pr: 7 })
    expect(new Date(info.time).getTime()).not.toBeNaN()
    expect(JSON.parse(out.mock.calls[1]![0] as string)).toMatchObject({ level: 'warn', message: 'careful' })
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({ level: 'error', message: 'boom', code: 1 })
  })
})
