# CLAUDE.md

Agent guidance for this repo lives in **[AGENTS.md](AGENTS.md)** — read it before making changes.

The normative specification is **[`_docs/specs.md`](_docs/specs.md)**.

Quick orientation:

- `frontend/` is the web UI and all current work. `backend/` (Python, `uv`) comes later and does not exist yet.
- **Mockup data in memory. No backend, no persistence — state resets on reload.** Deliberate; see spec §5.
- The framework is **Lovable's stack — TanStack Start in SPA mode** — and stays. Do not replace it, and do not add
  server routes or server functions.
- Commands run from `frontend/` with **bun**: `bun run dev`, `bun run build`, `bun run lint`.
- TypeScript is strict; `@/*` maps to `src/*`; styling is Tailwind with semantic tokens only.
- The chat assistant was removed on purpose. The bunny is the logo, not a feature.
