# AGENTS.md (backend)

Applies to `backend/`. Root `AGENTS.md` rules also apply.

## Map

- `src/github/` webhook handling and GitHub API calls
- `src/review/` review logic and Claude prompt
- `src/store/` persistence (Mongoose)
- `src/api/` dashboard REST API
- `src/queue.ts` review job queue
- `src/config.ts` env vars and `.pr-reviewer.yml` parsing
- `src/demo/` fake GitHub, Anthropic and store for `npm run demo`

## Commands (from `backend/`)

- `npm run dev` watch mode (loads `../.env`)
- `npm test`, `npm run test:coverage`, `npm run typecheck`, `npm run build`

## Rules

- Webhook signature must be verified before any processing. Never weaken it.
- Mock GitHub (Octokit) and Anthropic in tests. No real network calls.
- Mongo store tests need `MONGO_TEST_URI` and are skipped without it. Don't remove the skip.
- Validate env vars and repo config in `config.ts`, fail fast with a clear error.
- Don't log diffs, tokens, or the private key.
- Changing the review prompt or DB schema: ask first.
- Keep `demo/` working when you change interfaces it fakes.
