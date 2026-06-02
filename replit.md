# WH-Panel — WhatsApp Bot Hosting Panel

Um painel web para hospedar e gerenciar bots de WhatsApp 24/7, puxando código diretamente de repositórios Git.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/bot-panel run dev` — run the frontend (port 23571)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui (dark theme, terminal green)
- API: Express 5 + WebSocket (`ws`) for real-time terminal
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/bots.ts` — Bots table schema
- `artifacts/api-server/src/routes/bots.ts` — All bot REST routes
- `artifacts/api-server/src/lib/processManager.ts` — Child process management (start/stop/restart/logs)
- `artifacts/api-server/src/index.ts` — HTTP + WebSocket server
- `artifacts/bot-panel/src/` — React frontend
- Bot instance files stored at: `bot_instances/bot_<id>/`

## Architecture decisions

- Bots run as **Node.js child processes** on the server — they keep running even when the browser tab is closed
- WebSocket path `/ws/bots/:id/terminal` streams real-time stdout/stderr and accepts stdin input
- Git clone happens **after** the API responds (201) to avoid request timeout on large repos
- `/ws` path is registered in the API server's `artifact.toml` so the proxy forwards WebSocket upgrades
- In-memory log buffer (last 500 lines) per bot — served via REST for initial page load, then streamed via WS

## Product

- Dashboard listing all bots with live status (running/stopped/error)
- Add bot via Git URL + start command (e.g. `node index.js`, `npm start`)
- Per-bot terminal: live WebSocket output + input field (for phone number prompts, QR code, etc.)
- Start / Stop / Restart / Git Pull actions per bot
- Bots run 24/7 on the server — closing the browser does NOT stop them

## User preferences

- No upload option — only Git clone
- Terminal must accept user input (for when bot asks for phone number)
- Bots must stay running 24/7 even when browser is closed

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- After codegen, run `pnpm run typecheck:libs` if you see missing export errors
- `ws` package is externalized in esbuild — make sure it stays in `dependencies` not `devDependencies`
- WebSocket path `/ws` MUST be in the API server's `artifact.toml` paths array or the proxy drops WS upgrades

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
