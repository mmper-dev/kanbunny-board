<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Kanbunny — agent guide

A mini kanban board with dependency graphs.

## Read this first

[`_docs/specs.md`](_docs/specs.md) is the normative specification. When it and the code disagree, the spec describes
the target and the code is what still needs changing. Do not invent requirements that contradict it — raise the
conflict instead.

## Shape of the repo

```
frontend/   Node.js / TypeScript / React — the web UI (all current work)
backend/    later: Python, managed with uv — does not exist yet
_docs/      specs.md
```

**The app runs on mockup data held in memory. There is no backend and no persistence — state resets on reload.**
That is deliberate. The Python service arrives later and plugs into the seam described in spec §5.

## Framework — do not swap it

This project uses **Lovable's stack**, and it stays: TanStack Start (via `@lovable.dev/vite-tanstack-config`),
TanStack Router, React 19, Vite 8, Tailwind 4, shadcn/ui + Radix.

TanStack Start is a server framework, but the app runs in its **SPA mode** — a prerendered static shell, client-only
at runtime, no server. So:

- `src/server.ts`, `src/start.ts` and `__root.tsx`'s `shellComponent` **stay**. They are what prerenders the shell.
  Do not replace them with a hand-written `index.html`.
- Do not add server routes, server functions, or anything under `src/routes/api/`.

## Commands

Run from `frontend/`. Package manager is **bun**.

```bash
bun install      # bunfig.toml enforces a 24h minimum release age on packages
bun run dev
bun run build
bun run preview
bun run lint
bun run format
```

Ask the user before adding to `minimumReleaseAgeExcludes` in `bunfig.toml` — each entry bypasses the supply-chain
guard for that package.

## Architecture rules

- **[`openapi.yaml`](openapi.yaml) is the backend contract.** If you change `BoardApi`'s shape or
  the model in `board-data.ts`, update it in the same commit — it is what the Python service will
  be built against.
- **All data access goes through `src/api/`.** `BoardApi` is the contract, `mock-api.ts` the in-memory
  implementation. Every method is `async` and returns the created or updated entity — never assume an id the client
  generated, because the database will own id generation.
- **Only `src/api/` and `board-store.tsx` import `seed.ts`. Only `board-store.tsx` mutates state.** Components call
  store actions. This is the rule the current code breaks (see below).
- Selectors in `src/lib/board-queries.ts` are pure and take `tasks` as their first argument.

## Two traps in the existing code

- `board-store.tsx` implements full task / subtask / project CRUD, but **nothing renders it** — `routes/index.tsx`
  and `DependencyGraph.tsx` import the static `TASKS` array directly, so edits appear to do nothing.
- Helpers in `board-data.ts` default to `tasks = TASKS`, so calling one without an explicit list silently reads the
  seed instead of live state.

## Conventions

- **TypeScript is strict** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noPropertyAccessFromIndexSignature`. Do not loosen `tsconfig.json` to make code compile.
- **Path alias `@/*` → `src/*`.** No deep relative imports.
- **Tailwind with semantic tokens only**: `bg-card`, `text-muted-foreground`, `bg-lane`, `text-blocked`. Never a raw
  hex or a palette colour like `bg-slate-100`. New colours go into `src/styles.css` as `oklch` in both `:root` and
  `.dark`, then get registered in `@theme inline`.
- **Reuse `src/components/ui/*`** (shadcn/Radix). Do not hand-roll a dialog, select, checkbox or toast.
- Toasts go through `sonner`, mounted in `__root.tsx`.
- Run `bun run format` rather than hand-aligning.

## Product voice

Lane names are **Burrow / Next hop / In motion / Harvested** — product vocabulary, not placeholders. Copy is warm and
brief, at most one rabbit pun per surface. Strings like `Nothing — ready to hop` and `Who hops on it?` are canonical.

The bunny is the **logo**, not a feature. The chat assistant was removed deliberately; do not reintroduce it.

## Data model

`src/lib/board-data.ts`: `Task` (with `subtasks` and `dependsOn`), `Subtask`, `Project`, `Status`, `Priority`. Ids are
`T-<n>`, `S-<n>`, `P-<n>`. Field names are the wire contract for the future Python service — **do not rename them**.
The dependency graph **must stay acyclic** (spec §4.3, §8.4).

## What not to do

- Do not add a backend, an API route, a `fetch` to an application server, or an environment secret.
- Do not add persistence (localStorage, IndexedDB). Mockup data resetting on reload is intended for now.
- Do not reintroduce the chat assistant or the AI SDK dependencies.
- Do not swap the framework, or "simplify" TanStack Start away.
- Do not restyle the app. The look and feel is fixed by `src/styles.css` and spec §6.
- Do not rewrite published git history (see the Lovable note above).
