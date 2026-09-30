# Setup

You need: Docker (or Node 22.12+ and MongoDB), a GitHub account, and an Anthropic API key. Reviews cost API money
in proportion to diff size, so try it on a small repository first.

## 1. Create the GitHub App

GitHub: **Settings > Developer settings > GitHub Apps > New GitHub App**.

| Field | Value |
|---|---|
| GitHub App name | anything unique, e.g. `kartik-pr-reviewer` |
| Homepage URL | your repo URL (any URL works) |
| Webhook > Active | checked |
| Webhook URL | your public URL + `/webhook` (see step 2; use a placeholder for now) |
| Webhook secret | a long random string. Put the same value in `.env` as `GITHUB_WEBHOOK_SECRET` |

**Repository permissions** (everything else stays "No access"):

- **Pull requests: Read and write** (read the diff, post the review)
- **Contents: Read-only** (read `.pr-reviewer.yml`)
- **Metadata: Read-only** (mandatory)

**Subscribe to events:** tick **Pull request**.

**Where can this app be installed?** "Only on this account" is fine.

After creating it:

1. Note the **App ID** at the top of the app's page. This is `GITHUB_APP_ID`.
2. Scroll to **Private keys > Generate a private key**. A `.pem` file downloads. Never commit it.
3. **Install App** (left sidebar) and choose the repositories to review.

Turn the `.pem` into a single line for `.env` (PowerShell):

```powershell
(Get-Content .\your-app.private-key.pem -Raw) -replace "`r?`n", '\n'
```

or on macOS/Linux: `awk 'NF {printf "%s\\n", $0}' your-app.private-key.pem`

## 2. Make your machine reachable (local development)

GitHub must be able to POST to your server. Use a tunnel and paste its URL + `/webhook` into the App's Webhook URL.

- **smee.io** (simple, made for webhooks): create a channel at https://smee.io, then
  `npx smee-client --url https://smee.io/<channel> --target http://localhost:3001/webhook`
  and use the smee URL as the Webhook URL.
- or **cloudflared** / **ngrok**: `ngrok http 3001`, then use `https://<id>.ngrok-free.app/webhook`.

For a real deployment, deploy the `backend` container anywhere with a public HTTPS URL and use that instead.

## 3. Configure and run

```bash
cp .env.example .env      # then fill in the values
docker compose up --build
```

- Dashboard: http://localhost:3000 (sign in with `DASHBOARD_TOKEN`)
- API and webhook receiver: http://localhost:3001 (`/health` should answer `{"status":"ok"}`)

Without Docker:

```bash
npm run install:all        # root tooling + backend + frontend, and sets up the git hooks

# terminal 1 (needs a MongoDB on localhost:27017)
npm run dev:backend
# terminal 2
npm run dev:frontend       # http://localhost:5173
```

`npm run dev` loads the same `.env` file from the project root, and uses `MONGO_URI` from it, so set it to
`mongodb://localhost:27017/pr-reviewer` (or your own MongoDB) for this mode.

## 4. Try it

1. In an installed repository, create a branch, change a few lines (introduce an obvious bug, e.g. an unchecked
   `null`), and open a pull request.
2. Within a minute or so, a review with inline comments appears on the PR, and a row appears in the dashboard.
3. Optional: add `.pr-reviewer.yml` to the repo root to tune it (see README).

## Troubleshooting

| Symptom | Check |
|---|---|
| GitHub shows a red X on webhook deliveries (App settings > Advanced > Recent Deliveries) | Response code: `401` = secret in `.env` differs from the App's; `404/timeout` = tunnel URL or `/webhook` path wrong |
| Delivery is `202` but no review | Is the App installed on that repo? Is it a draft, a bot PR, or labelled `no-ai-review`? Look at the dashboard row's status and reason, and `docker compose logs backend` |
| Dashboard row says failed: "every model call failed" | Check `ANTHROPIC_API_KEY`, the model name, and your API quota in the logs |
| Server exits on start with "Invalid configuration" | The message lists every missing or invalid variable |
| Reviews arrive as one plain comment, not inline | GitHub rejected a line position (422). The app falls back to plain text; this is expected occasionally |
| Same PR reviewed twice | Each *new commit* is reviewed once. Comments already made are not repeated |
