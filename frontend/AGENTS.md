# AGENTS.md (frontend)

Applies to `frontend/`. Root `AGENTS.md` rules also apply.

## Stack

React + Vite dashboard. Client-side only, hash routing (`#/...`). Served by nginx in Docker.

## Commands (from `frontend/`)

- `npm run dev`
- `npm test`, `npm run test:coverage`, `npm run typecheck`, `npm run build`

## Rules

- Tests use Vitest + React Testing Library. Test behaviour users see, not implementation.
- Node 26's experimental `localStorage` breaks jsdom. Tests use an in-memory Storage. Keep that.
- Keep routing hash-based. nginx has no server-side route fallback to rely on.
- Support light and dark themes. Check both when changing styles.
- Talk to the backend only through its dashboard API. Don't hardcode URLs; use config.
- No secrets in frontend code. Everything shipped is public.
- Keep coverage floors. Don't lower them.
