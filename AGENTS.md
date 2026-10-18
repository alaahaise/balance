# balance-management

Electron desktop application for managing balances. This file is loaded into every
agent session. Follow it; when it conflicts with a skill, this file wins.

## Stack and layout

- TypeScript everywhere. No plain `.js` source files.
- `src/main/` — Electron main process (Node.js, full privileges).
- `src/preload/` — the only bridge between main and renderer.
- `src/renderer/` — UI (browser context, treat as untrusted).
- `src/shared/` — types and pure logic used by both processes.
- Keep business and money logic out of the renderer.

## Electron security (non-negotiable)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Expose a narrow, typed API from preload with `contextBridge.exposeInMainWorld`.
  Never expose `ipcRenderer` or a generic `invoke(channel, ...)` passthrough.
- Validate every IPC payload in the main process before use (schema, not `typeof`).
- Deny `window.open` and block navigation away from the app origin
  (`webContents.setWindowOpenHandler`, `will-navigate`).
- Never load remote content into a privileged window. Ship a strict CSP.
- `shell.openExternal` only with an allowlist of `https:` URLs.
- No `eval`, no `new Function`, no remote module.

## Data and money

- Weights are `DECIMAL(12,3)` kg in MySQL, never `FLOAT` or `DOUBLE`. Money uses
  integer minor units. Floats silently corrupt écarts.
- The renderer never touches MySQL. All access goes through typed IPC channels
  handled in the main process with a `mysql2` pool.
- Validate at every trust boundary: IPC input, file imports, balance frames.
- Never log secrets, tokens, or full account numbers.

## Engineering practice

- Understand the problem before writing code; read the files the change touches.
- Smallest change that solves it. Prefer the standard library and existing
  dependencies over new packages. Every new dependency is a decision to justify.
- Logic with a branch, a loop, a parser, money, or security leaves a test behind.
- Red-green-refactor for bug fixes: reproduce with a failing test first.
- Typecheck and lint must pass before a change is considered done.
- Review the diff for the bugs a reviewer would page someone about, not just style.
- Record non-obvious decisions as a short ADR in `docs/adr/`.

## Commands

- `npm run dev` — start Electron with hot reload.
- `npm run typecheck` / `npm run lint` / `npm test` — verify before reporting done.
- `npm run test:db` — integration tests against a throwaway MySQL started in WSL
  (`npm run test:db:down` stops it). They exercise the real SQL: counter
  allocation, capture lock, rollback, cancellation, ticket closure, field
  corrections.
- `npm run db:check-schema` — runs the migration chain against a throwaway
  server. Use it after adding a migration; schema errors otherwise only surface
  on the user's machine.

## Facts worth not rediscovering

- MySQL for this project runs inside WSL (Ubuntu), reachable from Windows on
  `127.0.0.1:3306` through the WSL relay. `tools/db-it.sh` starts a *separate*
  throwaway server on 3307 so tests never touch it.
- `serialport` ships N-API prebuilds, which are ABI-stable: no
  `electron-builder install-app-deps` is needed for Electron 44. It is loaded
  lazily so a missing native module cannot stop the app from starting.
- Balance configuration lives in `settings.json` (`app.getPath('userData')`),
  not in the database. The MySQL password there is encrypted with
  `safeStorage` (DPAPI on Windows).
- A ticket stays `status = OUVERTE` after the 2nd weighing (net/écart are
  computed but not committed). Only the operator's explicit confirmation
  (`operations.close`) sets `FERMEE`, and only `FERMEE` rows count in
  `v_stock_moves`. Do not "fix" this by closing in `capture`.
- Products are **lines** (`operation_lines`), one per product with its declared
  quantity; `operations.weight_supposed` is their sum, set at the 2nd weighing.
  The 2nd weighing refuses to run without at least one line, and lines are frozen
  once the 2nd weighing exists. `capture` accepts `lines` so an on-screen total
  can never be stale; `ops.setLines` replaces the whole list.
- The workflow is two screens: **1re balance** creates the primary ticket (and
  prints the "bon n° 1"), **2e balance** picks a waiting ticket, completes it,
  weighs again, and produces the final ticket. `ticket-html.ts` switches to a
  primary layout when `second == null`.
- Weights are never editable after capture — the `weighings` rows are the
  evidence. `operations.update` only touches descriptive columns, and logs to
  `audit_log`.
- The printed ticket and the on-screen preview are the same HTML
  (`src/main/ticket-html.ts`): `ops.html` renders it in the app, `ops.print`
  sends it to the printer. Change one, both change.
- `git` is not installed on this machine: there is no version control.

## Skills

Installed under `.opencode/skills/` (engineering best practices, frontend/UI, spec
and planning). Load the relevant one instead of improvising: `security-and-hardening`
for IPC/auth work, `frontend-ui-engineering` or `ui-ux-pro-max` for UI,
`test-driven-development` before writing logic, `api-and-interface-design` for IPC
and API contracts. Ponytail is active: it will push for less code, not fewer tests.
