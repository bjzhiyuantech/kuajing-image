# GPT Image Canvas

Local professional AI canvas built with tldraw, Hono, SQLite, and GPT Image 2.

## Quick Start

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Set `OPENAI_API_KEY` and, when using an OpenAI-compatible service, `OPENAI_BASE_URL` in `.env`.

Open the web app at `http://localhost:5173`.

## Scripts

- `pnpm dev` starts both workspace development workflows.
- `pnpm api:dev` starts the API development workflow.
- `pnpm web:dev` starts the web development workflow.
- `pnpm typecheck` checks shared, web, and API TypeScript.
- `pnpm build` builds shared, web, and API packages.
- `pnpm start` starts the built API package.

## Docker

Docker packaging is planned for a later story. Runtime data and generated assets must stay under `./data` and out of git.

## Ralph

Ralph templates live in `.agents/ralph`, and the executable PRD is `.agents/tasks/prd-gpt-image-canvas.json`.
