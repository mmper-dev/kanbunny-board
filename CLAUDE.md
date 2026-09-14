# CLAUDE.md

Agent guidance for this repo lives in **[AGENTS.md](AGENTS.md)** — read it before making changes.

The normative specification is **[`_docs/specs.md`](_docs/specs.md)** — note its header still describes an
older frontend-only revision; the backend has since landed (see AGENTS.md).

Quick orientation:

- Both `frontend/` (TypeScript/React, Lovable's stack) and `backend/` (Python/FastAPI, managed with `uv`)
  exist and are wired together. **[`openapi.yaml`](openapi.yaml)** is the contract between them.
- Two independent switches, mock vs. real, one per side:
  - frontend `VITE_API_MODE` — `mock` (in-browser demo data, no sign-in, default) or `http` (calls the
    backend, requires sign-in)
  - backend `KANBUNNY_STORE` — `database` (SQLAlchemy at `DATABASE_URL`, SQLite out of the box, default)
    or `memory` (in-process demo data, wiped on restart)
- The frontend framework is **Lovable's stack — TanStack Start in SPA mode** — and stays. Do not replace
  it, and do not add server routes or server functions to it; API work belongs in `backend/`.
- Frontend commands run from `frontend/` with **bun**: `bun run dev`, `bun run build`, `bun run lint`,
  `bun run test`. Backend commands run from `backend/` with **uv**: `uv sync`,
  `uv run uvicorn app.main:app --reload --port 8000`, `uv run pytest`.
- TypeScript is strict; `@/*` maps to `src/*`; styling is Tailwind with semantic tokens only.
- The chat assistant was removed on purpose. The bunny is the logo, not a feature.
