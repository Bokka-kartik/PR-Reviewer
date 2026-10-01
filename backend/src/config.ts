import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  MONGO_URI: z.string().min(1).default('mongodb://localhost:27017/pr-reviewer'),
  GITHUB_APP_ID: z.string().min(1),
  // PEM contents. Env files often store it on one line with literal "\n".
  GITHUB_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(8),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
  // Protects the dashboard API. Send as "Authorization: Bearer <token>".
  DASHBOARD_TOKEN: z.string().min(16),
  // Upper bound on the diff text sent to the model per PR.
  MAX_DIFF_CHARS: z.coerce.number().int().positive().default(300_000),
  // How many PRs are reviewed at the same time.
  REVIEW_CONCURRENCY: z.coerce.number().int().positive().default(2),
  // Optional comma-separated list of GitHub usernames permitted for AI review.
  ALLOWED_AUTHORS: z
    .string()
    .default('')
    .transform((val) =>
      val
        ? val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
  // Optional label that must be present on a PR to trigger a review (e.g. "ai-review").
  REQUIRE_LABEL: z.string().optional(),
})

export type Config = z.infer<typeof schema> & { privateKeyPem: string }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')
    throw new Error(`Invalid configuration:\n  ${problems}`)
  }
  return {
    ...parsed.data,
    privateKeyPem: parsed.data.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }
}
