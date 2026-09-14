# Kanbunny Board

A mini kanban board with dependency graphs — lanes, blocking relationships, and a layered graph of
what blocks what.

![The Kanbunny board: four lanes with task cards showing owners, points, subtask progress and blocked-by badges](_docs/board.png)

## How it was built

- **The look and feel is [Lovable](https://lovable.dev)'s** — the design system in `src/styles.css`
  (the oklch palette, Space Grotesk / DM Sans, the lane and card styling), the shadcn/ui component
  set, and the app's framework: TanStack Start via `@lovable.dev/vite-tanstack-config`. That visual
  identity is deliberately preserved, not redesigned.
- **Everything else was built with [Claude Code](https://claude.com/claude-code)** — moving the app
  into `frontend/`, dropping the server so it runs client-only, the mock data layer, the board
  interactions (create, edit, delete, drag-and-drop, keyboard shortcuts, search, the dependency
  graph and critical path), and the tests.

## Where things are

```
frontend/     the web UI — React 19, TanStack Start (SPA mode), Tailwind 4, shadcn/ui
backend/      later: Python, managed with uv — does not exist yet
openapi.yaml  the API contract the backend must implement
_docs/        specs.md, the normative specification
```

**The app runs on mockup data held in memory.** There is no backend and no persistence — edits
reset when you reload. Every data call goes through `frontend/src/api/`, where an in-memory mock
implements the same `BoardApi` interface the Python service will implement later, so swapping in a
real backend is one file. [`openapi.yaml`](openapi.yaml) specifies exactly what that backend has
to serve; [`_docs/specs.md`](_docs/specs.md) §5 explains the seam.

## Running it

Needs [bun](https://bun.sh).

```sh
cd frontend
bun install
bun run dev
```

Then open **http://localhost:8080** (Vite picks the next free port — 8081, 8082 — if that one is
already taken; the terminal prints the URL it chose). `Ctrl+C` stops it.

The rest, all from `frontend/`:

```sh
bun run build     # static build — nothing needs to run on a server
bun run preview
bun run test      # vitest: the pure queries and the mock API
bun run lint
```

Use `bun run test`, not `bun test` — the suite is written for vitest, and `bun test` is bun's own
runner.

> `bunfig.toml` sets `minimumReleaseAge = 86400`, so bun refuses package versions published in the
> last 24 hours. If an install fails on a brand-new release, that is why.

## Using the board

- **Drag** a card between lanes, or use the `⋯` menu on any card — which is also the only way on
  touch, since HTML5 drag events do not fire there.
- **Keyboard**: press `?` for the full list.
  `j` `k` `h` `l` or the arrows move focus, `1`–`4` send the focused card to a lane,
  `⇧←` `⇧→` nudge it one lane, `n` creates, `e` edits, `/` searches, `b` and `g` switch
  board and graph.
- **Graph** view maps the blocking chain; *Critical path* highlights the longest one.
- Tasks can wait on other tasks. A dependency that would create a **loop** is refused, in the
  dialog and in the API.

## Lanes

**Burrow** → **Next hop** → **In motion** → **Harvested**
