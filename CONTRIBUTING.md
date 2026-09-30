# Contributing

## Get set up

```bash
npm run install:all     # root tooling + backend + frontend, and installs the git hooks
npm run demo            # backend with fake data, no accounts needed
npm run dev:frontend    # dashboard on http://localhost:5173
```

Node 22.13 or newer is required. To run against a real GitHub App, follow [docs/SETUP.md](docs/SETUP.md).

## Before you commit

The git hooks do most of this for you on every commit: they format and lint the staged files, typecheck, and run all
tests. To run the same checks yourself:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), checked by the `commit-msg` hook:

```
feat: add a daily token budget per repository
fix: ignore comments on deleted lines
docs: explain the .pr-reviewer.yml settings
```

Other types in use: `refactor`, `test`, `chore`, `style`.

## Pull requests

- Keep them focused. Formatting-only changes go in their own commit.
- New behaviour needs a test. Bug fixes need a test that fails without the fix.
- CI runs lint, formatting, typecheck, tests with coverage floors, builds and Docker image builds.
  Coverage floors live in `backend/vitest.config.ts` and `frontend/vite.config.ts`.
