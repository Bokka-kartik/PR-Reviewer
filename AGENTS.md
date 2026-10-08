# AGENTS.md

Guidance for AI coding agents working in this repo. Humans: see README.md and CONTRIBUTING.md.

## What this is

AI pull-request reviewer, run as a GitHub App. A webhook receives PR events, the backend fetches the diff, asks Claude for a review, and posts comments. Results are stored in MongoDB and shown in a React dashboard. Per-repo behaviour is configured with `.pr-reviewer.yml`.

## Layout

- `backend/` Node 22 + TypeScript (Express, Octokit, Anthropic SDK, Mongoose)
  - `src/github/` webhook and GitHub API, `src/review/` review logic, `src/store/` persistence, `src/api/` dashboard API, `src/queue.ts` job queue, `src/config.ts` env and repo config
  - `src/demo/` + `npm run demo` run without real GitHub, Anthropic or Mongo
- `frontend/` React + Vite dashboard (hash routing, client-side)
- `docs/SETUP.md` GitHub App and API key setup
- Root `package.json` holds shared tooling (ESLint, Prettier, Husky, commitlint) and shortcut scripts

## Commands (run from repo root)

- Install: `npm run install:all`
- Dev: `npm run dev:backend`, `npm run dev:frontend`
- Check before finishing any change: `npm run lint && npm run typecheck && npm test`
- Format: `npm run format` (CI runs `format:check`)
- Coverage: `npm run test:coverage` (floors are enforced; don't lower them)
- Build: `npm run build`

## Conventions

- TypeScript strict. No `any` unless unavoidable, and comment why.
- Match surrounding style. Prettier and ESLint are the source of truth.
- Commits follow Conventional Commits (commitlint enforces it), e.g. `feat(review): skip lockfiles`.
- Work on a branch, not `main`. Keep changes small and focused.
- Add or update tests with every behaviour change (Vitest backend, Vitest + React Testing Library frontend).
- Node >= 22.13 is required. Older versions break the installed deps.

## Testing notes

- Mongo store tests are skipped unless `MONGO_TEST_URI` is set (they run in CI).
- Never call real GitHub or Anthropic APIs in tests. Mock them.
- Node 26's experimental `localStorage` breaks jsdom, so frontend tests use an in-memory Storage. Keep that.

## Do not

- Commit secrets: `.env`, GitHub App private key, `ANTHROPIC_API_KEY`, webhook secret. Use `.env.example` for new variables.
- Log full diffs, tokens or private keys.
- Skip webhook signature verification or weaken it.
- Bypass git hooks (`--no-verify`) or edit lockfiles by hand.
- Add dependencies without a clear need. Say why in the PR.

## Known untested areas

Real GitHub App and webhook flow, real Anthropic calls, Mongo store against a live DB, Docker builds. Be extra careful and say so when touching these.

## When unsure

Ask before changing the review prompt, the webhook handling, or the data schema. These affect every user of the app.
