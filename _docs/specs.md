# Kanbunny — Mini Kanban Specification

| | |
|---|---|
| **Status** | Draft — ready for implementation |
| **Date** | 2026-09-14 |
| **Applies to** | `mmper-dev/kanbunny-board`, branch `main` |
| **This revision** | Frontend-only UI in `frontend/`, Lovable's framework retained, chat removed |

---

## 1. Purpose and scope

Kanbunny is a **mini kanban board with a dependency graph**. This revision builds **only the web UI**, in a
`frontend/` directory, running on **mockup data held in memory**. A Python backend (`uv`) and a real database come
later, once the UI is wired and settled.

### 1.1 In scope

| Area | What is kept |
|---|---|
| **Design** | The entire look and feel — tokens, fonts, lane styling, card anatomy, graph rendering, copy voice (§6) |
| **Data model** | Projects, tasks, subtasks, and the `dependsOn` relationships between tasks (§4) |
| **Actions** | Create, edit, delete for tasks / subtasks / projects; drag-and-drop between lanes; keyboard shortcuts; filter; project switching (§7–§10) |

### 1.2 Out of scope for this revision

- **The Kanbunny chat assistant is removed entirely** — routes, UI, AI SDK, gateway, server route. The bunny stays
  as the product's mascot and logo, not as a feature. It can return later on top of the Python backend.
- Any backend, API server, database, or network call. **The app makes zero requests to an application server.**
- Persistence. Board state is mockup data and resets on reload. This is deliberate — §5 defines the seam the
  backend plugs into so nothing has to be rewritten when it arrives.
- Authentication, multi-user, realtime, sharing.
- Reordering cards *within* a lane. A dropped card goes to the end of its new lane.

### 1.3 Target architecture (for context — not built here)

```
kanbunny-board/
├── frontend/   ← this specification (Node.js / TypeScript / React)
├── backend/    ← later: Python, managed with uv (§14)
└── _docs/
```

---

## 2. Two constraints, and how they interact

Two instructions shape this revision, and they pull against each other in one specific place. Recording the
resolution here so it is not relitigated mid-build.

### 2.1 "Use whatever framework Lovable is using" — resolved, no conflict

Lovable builds this project on **TanStack Start**, wired through `@lovable.dev/vite-tanstack-config`. An earlier
draft of this spec proposed tearing that out for a plain Vite SPA. **That is reversed.** The whole Lovable stack
stays:

| Layer | Version on `main` |
|---|---|
| `@lovable.dev/vite-tanstack-config` | `^2.20.0` |
| `@tanstack/react-start` | `1.168.32` |
| `@tanstack/react-router` | `1.170.18` |
| React | `^19.2.0` |
| Vite | `8.1.5` |
| Tailwind CSS | `^4.2.1` |
| shadcn/ui + Radix | per `components.json` |
| `nitro` (build only) | `3.0.260603-beta` |

TanStack Start being a *server* framework is not an obstacle: it ships a **SPA mode** that prerenders a static shell
and boots the app on the client only, with no server at runtime. That is exactly the shape needed here — see §3.2.

### 2.2 "Into a `frontend/` directory" — real consequence, needs a decision

Lovable's editor sync expects the app at the **repository root**. Moving it under `frontend/` will very likely break
that sync, even though the framework and the config package are unchanged.

Both instructions are explicit, so the move proceeds as asked. **Flagging the trade rather than silently making it:**
if Lovable's editor remains important, the alternative is to keep the app at the root and put the Python service in
`backend/` alongside it — same separation, Lovable sync intact, no `frontend/` directory. Say so before step 1 of
§15 if that is preferred.

The `AGENTS.md` rule about never rewriting published git history stands either way. Use `git mv` for the move so
history follows the files.

---

## 3. Toolchain and build

### 3.1 Repository layout after the move

```
kanbunny-board/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── _docs/
│   └── specs.md
└── frontend/
    ├── package.json          ← moved from root
    ├── vite.config.ts        ← moved, SPA mode added (§3.2)
    ├── tsconfig.json
    ├── eslint.config.js
    ├── components.json
    ├── bunfig.toml
    ├── bun.lock
    ├── public/
    │   ├── favicon.png
    │   └── robots.txt
    └── src/
        ├── api/              ← new: the backend seam (§5)
        ├── assets/
        ├── components/
        │   └── ui/           ← shadcn, untouched
        ├── hooks/
        ├── lib/
        ├── routes/
        ├── router.tsx
        ├── server.ts
        ├── start.ts
        └── styles.css
```

Everything currently at the repo root except `AGENTS.md`, `CLAUDE.md`, `README.md` and `_docs/` moves into
`frontend/`. Nothing about the internal structure of `src/` changes except as specified in §3.3 and §5.

### 3.2 SPA mode

Enable SPA mode so the build produces a prerendered static shell plus a client bundle, with no runtime server:

```ts
// frontend/vite.config.ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true },
  },
});
```

Notes:

- The Lovable wrapper already forwards a `tanstackStart` options object — the existing `server.entry` line proves the
  pass-through works. `spa.enabled` goes in the same object.
- `spa.prerender` accepts the standard prerender options if the shell needs a custom output path. Not required.
- `src/server.ts` and `src/start.ts` **stay**. They are Lovable scaffolding, `vite.config.ts` references
  `server.entry` explicitly, and SPA mode still uses a build-time server to render the shell. Deleting them is out of
  scope and risks breaking the Lovable config.
- `__root.tsx`'s `shellComponent` (the `html` / `head` / `body` wrapper) also **stays** — it is what gets prerendered
  into the static shell. This is the opposite of what a plain-Vite rewrite would do; do not move those tags into an
  `index.html`.
- **Known risk:** TanStack Router issue #5171 reports SPA mode hanging on the loading skeleton under Bun + Vite 7.
  This repo is Bun + Vite 8. If the dev server hangs on a skeleton after enabling SPA mode, try Node + npm before
  assuming the app is broken.

### 3.3 Files to delete (all chat-related)

| Path | Reason |
|---|---|
| `src/routes/api/chat.ts` | Server route calling the LLM |
| `src/lib/ai-gateway.server.ts` | Lovable AI gateway provider |
| `src/routes/kanbunny.tsx` | Chat layout + thread sidebar |
| `src/routes/kanbunny.index.tsx` | Chat redirect route |
| `src/routes/kanbunny.$threadId.tsx` | Chat thread route |
| `src/components/ChatWindow.tsx` | Chat UI |
| `src/components/ai-elements/*` | Chat primitives (all six files) |
| `src/lib/threads.tsx` | Chat thread state |

`src/assets/kanbunny.png` **stays** — it is the logo.

### 3.4 Dependencies to remove

`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`, `streamdown`, `@streamdown/cjk`, `@streamdown/code`,
`@streamdown/math`, `@streamdown/mermaid`, `shiki`, `use-stick-to-bottom`, `zod`.

`zod` goes only if nothing else imports it after the chat route is deleted — check before removing.

`@tanstack/react-query` **stays**, mounted in `__root.tsx`. Nothing uses it yet; it is where the backend lands (§5.4).

No new runtime dependency is added. Drag-and-drop uses native HTML5 drag events (§8).

### 3.5 Commands

The repo is configured for **bun** (`bun.lock`, `bunfig.toml`). "Node.js for the frontend" is read as the JS/Node
ecosystem rather than a demand to drop bun; bun runs the same Vite toolchain. If a plain Node toolchain is wanted,
`npm install && npm run dev` works too — but pick one and delete the other lockfile.

```bash
cd frontend
bun install       # bunfig.toml enforces a 24h minimum release age
bun run dev
bun run build     # static output, no server bundle
bun run preview
bun run lint
```

`bunfig.toml`'s `minimumReleaseAgeExcludes` list bypasses the supply-chain guard per package. Do not add entries
without asking.

### 3.6 TypeScript

The code is TypeScript under a strict `tsconfig.json` (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
`noPropertyAccessFromIndexSignature`). **It stays TypeScript.** "JavaScript for the frontend" is read as naming the
ecosystem opposite Python — converting a strict-TS shadcn codebase to plain `.js` would delete the data model's
type safety for no gain. Say so if literal `.js` was meant.

---

## 4. Data model

Unchanged from `src/lib/board-data.ts`. These types are the contract shared with the future Python backend (§5.2);
do not rename fields.

```ts
type Status   = "backlog" | "todo" | "doing" | "done";
type Priority = "low" | "medium" | "high";

type Subtask = { id: string; title: string; status: Status; assignee: string };

type Task = {
  id: string;            // "T-<n>"
  title: string;
  detail: string;
  status: Status;
  priority: Priority;
  assignee: string;
  points: number;
  projectId: string;     // "P-<n>"
  subtasks: Subtask[];
  dependsOn: string[];   // ids of tasks that must finish before this one
};

type Project = { id: string; name: string; hue: number };
```

### 4.1 Lane vocabulary — product voice, not placeholders

| `Status` | Label |
|---|---|
| `backlog` | **Burrow** |
| `todo` | **Next hop** |
| `doing` | **In motion** |
| `done` | **Harvested** |

### 4.2 Mockup dataset

The existing seed is the mockup data: projects **Carrot Ops** (`hue 24`) and **Meadow Platform** (`hue 142`), tasks
`T-1`…`T-9` with subtasks `S-1`…`S-5` and their dependency edges. Move it to `src/api/seed.ts`; `board-data.ts` keeps
only types, constants (`COLUMNS`, `STATUS_LABEL`) and pure helpers.

### 4.3 Invariants

1. Task and subtask ids are unique board-wide.
2. `dependsOn` references only tasks that exist. Deleting a task prunes its id from every other task's `dependsOn`.
   Deleting a project deletes its tasks and prunes references to them. (Both already implemented.)
3. A task never depends on itself.
4. **The dependency graph stays acyclic.** Not enforced today; required (§7.4). `depthOf()` has a `seen` guard
   against infinite recursion, but a cycle still produces a meaningless layout.
5. `points` is an integer `>= 0`.
6. A task's `status` is independent of its subtasks'. Subtask progress is displayed, never inferred.

---

## 5. The backend seam

The single most important structural decision in this revision. The UI is built against an **API interface** from day
one, with an in-memory mock behind it. When the Python service arrives, one file is swapped and no component changes.

### 5.1 Shape

```
src/api/
├── types.ts       # re-exports the model types from lib/board-data
├── board-api.ts   # the BoardApi interface — the contract
├── mock-api.ts    # in-memory implementation, seeded from seed.ts
├── http-api.ts    # later: fetch implementation against the Python service
└── seed.ts        # the mockup dataset
```

```ts
interface BoardApi {
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string }): Promise<Project>;
  updateProject(id: string, patch: Partial<Omit<Project, "id">>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<TaskInput>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  createSubtask(taskId: string, input: SubtaskInput): Promise<Task>;
  updateSubtask(taskId: string, subtaskId: string, patch: Partial<SubtaskInput>): Promise<Task>;
  deleteSubtask(taskId: string, subtaskId: string): Promise<Task>;
}
```

Three rules that make the swap free:

1. **Every method is `async`, from the very first commit.** The mock returns already-resolved promises. If the UI is
   written against synchronous calls it will all need rewriting later; written against promises, nothing does.
2. **The API returns the created or updated entity; the client never invents an id.** Today `board-store.tsx`
   generates `T-<n>` on the client. A database will own id generation, so the mock generates the id *inside*
   `createTask` and returns the whole task. Callers read `result.id`.
3. **Subtask mutations return the parent `Task`**, so the caller never has to merge a partial result.

### 5.2 Wire format for the future Python service

> **[`openapi.yaml`](../openapi.yaml) at the repository root is the normative contract** — every
> endpoint, body, status code and the authentication requirement. It is generated from and kept in
> step with `BoardApi`. What follows is the summary; where the two disagree, the OpenAPI document
> wins.

Fix this now so the backend has a target and no mapping layer is ever needed:

- JSON, **camelCase** field names exactly as §4 declares them. On the FastAPI side that means a Pydantic
  `alias_generator=to_camel` with `populate_by_name=True` — Python keeps `snake_case` internally, the wire stays
  camelCase.
- Ids stay opaque strings. `T-<n>` is a display convention, not a format the client parses — except for the
  graph's node labels, which render the id verbatim.
- Planned endpoints:

| Method | Path |
|---|---|
| `GET` / `POST` | `/api/projects` |
| `PATCH` / `DELETE` | `/api/projects/{id}` |
| `GET` / `POST` | `/api/tasks` |
| `PATCH` / `DELETE` | `/api/tasks/{id}` |
| `POST` | `/api/tasks/{id}/subtasks` |
| `PATCH` / `DELETE` | `/api/tasks/{id}/subtasks/{subtaskId}` |

### 5.3 Mock behaviour

- Seeded from `seed.ts` on first construction; state lives in a module-level array.
- Ids from the existing `nextId(prefix, existing)` rule — max numeric suffix + 1.
- Resolves immediately. Optionally gate an artificial delay behind `VITE_MOCK_LATENCY` so loading states can be
  exercised; default `0`.
- `resetBoard()` restores the seed (§6.1 gives it a UI home).

### 5.4 Store

`BoardProvider` (`src/lib/board-store.tsx`) keeps its current public API, with mutations becoming `async` and
delegating to `boardApi`. It holds the canonical `tasks` / `projects` arrays plus a `loading` flag for the initial
`listTasks()` / `listProjects()`.

Optimistic updates: apply the change locally, then reconcile with the returned entity. On a rejected promise, roll
back and `toast.error`. The mock never rejects, but writing the path now means the HTTP swap needs no new code.

When the backend lands, `BoardProvider`'s internals can move to `useQuery` / `useMutation` — which is why
`QueryClientProvider` stays mounted.

### 5.5 The rule that makes this work

**Nothing outside `src/api/` and `board-store.tsx` imports `seed.ts`, and nothing outside `board-store.tsx` mutates
state.** This is precisely the bug in the current code: `routes/index.tsx` and `DependencyGraph.tsx` import the static
`TASKS` array directly, which is why the CRUD in `board-store.tsx` exists but has no visible effect. Fixing it is
step 2 of §15.

### 5.6 Selectors

Pure functions in `src/lib/board-queries.ts`, no React. The existing helpers move here and take `tasks` as their
first argument — **drop the `= TASKS` default parameters**, which silently read the seed instead of live state.

| Function | Returns |
|---|---|
| `byId(tasks, id)` | `Task \| undefined` |
| `blockers(tasks, task)` | dependencies whose `status !== "done"` |
| `dependents(tasks, id)` | tasks whose `dependsOn` includes `id` |
| `depthOf(tasks, task)` | longest path from a root — the graph's layer index |
| `isReady(tasks, task)` | no unfinished blockers and not itself done |
| `criticalPath(tasks)` | longest dependency chain as `Task[]`, root → leaf |
| `wouldCycle(tasks, id, nextDependsOn)` | `boolean`, used by §7.4 |
| `laneCounts(tasks)` | `Record<Status, number>` |
| `matches(tasks, query)` | filter over id, title, detail, status, assignee, priority |

---

## 6. Design system — unchanged

`src/styles.css` carries over byte-for-byte and is normative. Restated here for convenience.

### 6.1 Tokens (light)

| Token | Value |
|---|---|
| `--radius` | `0.875rem` |
| `--background` | `oklch(0.975 0.014 95)` — warm paper |
| `--foreground` | `oklch(0.27 0.035 145)` — deep green-grey |
| `--card` | `oklch(0.995 0.006 95)` |
| `--primary` | `oklch(0.45 0.09 150)` — meadow green |
| `--secondary` | `oklch(0.93 0.03 120)` |
| `--muted-foreground` | `oklch(0.52 0.03 140)` |
| `--accent` | `oklch(0.72 0.17 55)` — carrot |
| `--border` / `--input` | `oklch(0.9 0.02 110)` |
| `--ring` | `oklch(0.62 0.12 150)` |
| `--lane` | `oklch(0.955 0.018 105)` |
| `--blocked` | `oklch(0.66 0.16 40)` |

A `.dark` block exists. There is no theme toggle today and none is added. All colours stay `oklch`. New semantic
colours are added to `:root` **and** `.dark`, then registered in `@theme inline`.

### 6.2 Type

- Display (`h1`–`h3`): **Space Grotesk** 500/700, `letter-spacing: -0.02em`
- Body: **DM Sans** 400/500/700
- Both loaded from Google Fonts via the `links` array in `__root.tsx`'s `head()` — unchanged, and still correct under
  SPA mode because the shell is prerendered.

### 6.3 Surfaces

- `body`: radial dot grid, 1px dots of `foreground` at 8% on a 22px grid.
- Lane: `rounded-2xl bg-lane p-3`
- Card: `rounded-xl border bg-card p-3 shadow-sm`; hover `-translate-y-0.5 shadow-md`; focus `ring-2 ring-ring`
- Detail aside: `rounded-2xl border border-border bg-card p-5`
- Pills and filters: `rounded-full text-xs`
- Header: `sticky top-0 z-10 border-b bg-background/85 backdrop-blur`
- Page container: `mx-auto max-w-7xl px-4`

### 6.4 Copy voice

Warm and brief, at most one rabbit pun per surface. Canonical strings to preserve: `Nothing — ready to hop`,
`Who hops on it?`, `What needs doing?`.

---

## 7. Screens and components

With the chat gone there is **one screen**: the board, with a board/graph toggle. `/` is the only route besides the
existing 404. TanStack Router stays (it is Lovable's stack and already wired) — it simply has one route to serve.

### 7.1 Header

Left to right: mascot (36×36) · **Kanbunny** with a dynamic subtitle (active project name or `All projects`, then
`· {n} tasks`) · **filter input** (§9) · segmented **board / graph** toggle · **New task** button (`Plus`, primary,
`rounded-full`) · overflow menu with **Reset board** and **Keyboard shortcuts**.

The **Ask Kanbunny** CTA is removed with the chat.

`Reset board` restores the mockup dataset — genuinely useful once a demo has been scribbled on. It confirms via
`AlertDialog`.

### 7.2 Project bar

`ProjectBar` is already built and matches the design — wire it in below the header. It provides the
`All projects · n` chip, a chip per project with inline rename (`Pencil` → input, Enter saves, Escape cancels) and
delete, and an outline **+ Project** button.

Two additions:

- **Delete confirmation.** Deleting a project deletes its tasks. `AlertDialog`: `Delete {name}?` /
  `This also removes {n} task(s) and any links to them.`, destructive confirm.
- **Use `Project.hue`.** It is seeded (24, 142), computed in `addProject`, and currently rendered nowhere. Tint the
  project chip with `oklch(0.93 0.06 {hue})` and give each card a 2px left border in its project's hue, so project
  membership is visible on the board. Either use the field or delete it from the model — dead fields rot.

### 7.3 Lanes

Four lanes in `COLUMNS` order, grid `md:grid-cols-2 xl:grid-cols-4`, `gap-4`. Lane header: label + count pill
(`rounded-full bg-card px-2 py-0.5 text-[11px]`). Cards stack `flex-col gap-2.5`. Minimum height `min-h-24` so an
empty lane is still a drop target.

Empty lane placeholder — `rounded-xl border border-dashed border-border/70 p-6 text-center text-xs
text-muted-foreground` — with **per-lane copy**, not a template:

| Lane | Copy |
|---|---|
| Burrow | `The burrow is empty.` |
| Next hop | `Nothing queued up next.` |
| In motion | `Nothing in motion.` |
| Harvested | `Nothing harvested yet.` |

### 7.4 Task card

Current anatomy, preserved exactly:

- Row 1: monospace `T-n` (`text-[11px] text-muted-foreground`) · priority pill, right-aligned
  - `high` → `bg-accent/15 text-accent-foreground/90 border-accent/40`
  - `medium` → `bg-primary/10 text-primary border-primary/25`
  - `low` → `bg-muted text-muted-foreground border-border`
- Title `text-sm font-semibold leading-snug`
- Detail `line-clamp-2 text-xs text-muted-foreground`
- Meta row (`text-[11px]`): assignee pill on `bg-secondary` · `{points} pts` · `GitBranch` + dependent count when
  > 0 · blocked badge `Lock` + `blocked by T-1, T-2` on `bg-blocked/15 text-blocked` when blockers exist

Additions:

1. **Subtask progress** when `subtasks.length > 0`: `CheckSquare` + `{done}/{total}`.
2. **Project hue** as a 2px left border (§7.2).
3. **An always-present `⋯` overflow menu** (`DropdownMenu`) with `Edit`, `Move to ▸` (four lanes), `Delete`. Not
   hover-only: hover-revealed controls are invisible on touch, and this menu is also the only way to move a card on a
   touch device (§8.5). On pointer devices it may fade in at `opacity-60` and go full opacity on hover or focus, but
   it must be visible and hit-testable at all times under `@media (hover: none)`.
4. **Element change:** the card is a `<button>` today. It becomes `<div role="button" tabIndex={...}>` with
   `draggable` — nested buttons cannot live inside a `<button>`, and HTML5 dragging of `<button>` is unreliable in
   Firefox. Tab index is managed by the roving-focus model in §10.2.

Selected state: `border-primary ring-2 ring-primary/30`. Focused state: `ring-2 ring-ring`.

### 7.5 Detail aside

Below the board when a card is selected, as today: `T-n` + title, **Close**, detail paragraph, then a three-column
grid — **Owner**, **Waiting on** (`{id} {title}` joined, else `Nothing — ready to hop`), **Blocks** (ids joined, else
`Nothing`).

Additions: a **Subtasks** list (status dot, title, assignee) and an **Edit** button.

### 7.6 Graph view

`DependencyGraph` keeps its geometry and styling — nodes `168×58`, gaps `84×26`, `rx 12`, layered by `depthOf`,
cubic bezier edges with `arrow` / `arrow-lit` markers, done nodes `fill-secondary`, the selected node and its
neighbours lit `stroke-accent` while the rest drop to `opacity-40` (edges) / `opacity-50` (nodes), titles truncated
at 21 chars + `…`.

Changes:

1. Read tasks from `useBoard()`, not the static `TASKS`; recompute when tasks change.
2. Respect the project filter and the search filter.
3. **Critical path toggle** above the canvas (pill, styled like the view toggle): strokes `criticalPath()` in
   `--blocked` at `strokeWidth 3` with matching node outlines.
4. Empty state: centred `text-sm text-muted-foreground` — `No tasks to map here yet.`
5. Nodes are keyboard reachable: `tabIndex={0}`, Enter selects, matching the board's selection state.

---

## 8. Create, edit, delete

### 8.1 Task dialog

`TaskDialog` is already built and matches the design. Fields in order: Title, Notes (textarea, 3 rows), then a
two-column grid — Project (select), Lane (select over `COLUMNS`), Priority (select), Owner (input), Points (number,
min 0) — then **Waiting on**, a `max-h-40` scrollable checkbox list of every other task showing `T-n`, title, and the
task's lane label right-aligned.

Footer: ghost **Cancel** · primary **Add task** / **Save changes**. Title: `New task` / `Edit T-n`.

Save is `async`; the primary button shows a spinner and disables while the promise is in flight (free with the mock,
correct with the backend).

### 8.2 Create

Defaults: `status: "backlog"`, `priority: "medium"`, `points: 3`, `projectId` = active filter or first project, empty
`dependsOn`. An empty title saves as `Untitled task` (current behaviour — keep).

### 8.3 Delete

From the card overflow menu or the dialog, with an `AlertDialog`: `Delete {id}?` /
`Other tasks that wait on it will lose that link.` Deleting clears the selection if the deleted task was selected.

### 8.4 Cycle guard — new, required

Before saving, run `wouldCycle(tasks, taskId, draft.dependsOn)`. On a cycle: do not save, show
`toast.error("That would make a loop — {A} already waits on {B}.")` naming the actual pair, and mark the offending
row `text-destructive`. In the **Waiting on** list, any task that already depends transitively on the task being
edited renders disabled with the hint `would loop`.

### 8.5 Subtasks — new UI, store methods already exist

A **Subtasks** section at the foot of the dialog:

- One row per subtask: a checkbox toggling `done` / `todo`, an inline-editable title, an assignee input, and a
  `Trash2` delete. (The type carries all four statuses; the UI exposes done / not-done. Narrowing the UI is
  deliberate — four lanes per subtask is more model than a mini board needs.)
- An **+ Add subtask** row: title input, Enter or button commits; assignee defaults to the parent's owner, status
  to `todo`.
- Header shows `{done}/{total}` with a thin `Progress` bar in `--primary`.
- Subtask edits commit immediately to the store rather than joining the dialog's draft.

---

## 9. Filter

A search input in the header (`Search` icon, `rounded-full`, `w-56`), filtering both the board and the graph by
`matches()` over id, title, detail, status, assignee and priority. Debounced 150ms. `Escape` clears it and returns
focus to the board. Shows a clear (`X`) button when non-empty.

When a filter is active, lane counts show `{visible} / {total}`.

This replaces the search capability the removed chat assistant provided.

---

## 10. Interactions

### 10.1 Drag and drop

Native HTML5 drag events, no library.

| Event | Behaviour |
|---|---|
| `dragstart` (card) | `dataTransfer.setData("text/plain", task.id)`, `effectAllowed = "move"`, card to `opacity-50` |
| `dragover` (lane) | `preventDefault()`, `dropEffect = "move"`, show affordance |
| `dragleave` (lane) | clear affordance — guard child-element flicker with a counter or a `relatedTarget` check |
| `drop` (lane) | read the id, `updateTask(id, { status })`, clear affordance |
| `dragend` (card) | clear all drag state regardless of outcome |

- Drop affordance: lane gains `ring-2 ring-primary/40 bg-lane/80`.
- The whole lane is the target, empty area included.
- Dropped cards append to the end of the lane; within-lane reordering is out of scope.
- Dropping onto the current lane is a no-op — no toast, no write.
- Dropping a task that still has unfinished blockers into **Harvested** is **allowed**, with a warning toast:
  `T-3 is harvested, but it was still waiting on T-2.` The board describes reality; it does not enforce process.
- **HTML5 drag events do not fire on touch devices.** Touch users move cards via the card's `⋯` menu (§7.4) —
  which is why that menu is always visible rather than hover-revealed.

### 10.2 Keyboard shortcuts

A first-class feature, not a fallback. Implemented in one `useKeyboardShortcuts` hook, with a **roving tabindex**
across cards: exactly one card in the board carries `tabIndex={0}`, the rest `-1`.

**Suppression rules.** Shortcuts are ignored when focus is inside an `input`, `textarea`, `select` or
`contenteditable`, or when a dialog is open — except `Escape`, and `?` which is always available.

| Key | Action |
|---|---|
| `?` | Open the shortcuts overlay (`Dialog`, listing this table) |
| `n` | New task |
| `e` | Edit the focused card |
| `Delete` / `Backspace` | Delete the focused card (confirm dialog) |
| `/` | Focus the filter input |
| `b` / `g` | Board view / graph view |
| `Enter` / `Space` | Select the focused card, opening the detail aside |
| `Escape` | Close dialog → clear filter → clear selection, in that order |
| `←` `→` or `h` `l` | Move focus to the previous / next lane, clamping the row index |
| `↑` `↓` or `j` `k` | Move focus to the previous / next card in the lane |
| `Home` / `End` | First / last card in the lane |
| `1` `2` `3` `4` | Move the focused card to Burrow / Next hop / In motion / Harvested |
| `Shift+←` / `Shift+→` | Move the focused card one lane left / right |

Focus follows a moved card: after `3` or `Shift+→` the card is re-focused in its new lane. Every move is announced
in an `aria-live="polite"` region — `{id} moved to {label}.` — which also covers drag-and-drop drops.

`1`–`4` and `Shift+arrow` make every drag action reachable from the keyboard, so the pointer-only drag
implementation is not an accessibility dead end.

---

## 11. Accessibility and responsiveness

- Every icon-only control carries an `aria-label` (`ProjectBar` already does).
- Focus is always visible: `focus-visible:ring-2 focus-visible:ring-ring`.
- Radix dialogs trap and restore focus — do not override.
- Lanes are labelled regions: `aria-label="{label} lane, {n} tasks"`.
- Colour is never the only signal: blocked carries `Lock` + text, priority carries its word, project hue is
  supplementary to the project name, the critical path carries a legend.
- Board: 1 column below `md`, 2 at `md`, 4 at `xl`. The graph scrolls horizontally in its rounded container.
- **Touch:** card overflow menus are always visible; drag is unavailable and the menu covers it.
- Contrast target 4.5:1 for body text. Verify `--muted-foreground` on `--lane`, and `--blocked` on `bg-blocked/15` —
  the two tightest pairs in the palette.

---

## 12. Testing

The repo has no test runner. Add **vitest**; it shares Vite's config and needs no extra build setup.

Unit tests are required for the pure logic, which is where the subtle bugs live:

- `wouldCycle` — direct cycle, transitive cycle, self-reference, and the legitimate diamond `A→B, A→C, B→D, C→D`
  which must **not** be rejected.
- `criticalPath` — returns one continuous chain on the seed; handles a board with no edges.
- `depthOf`, `blockers`, `dependents`, `isReady`, `laneCounts`, `matches`.
- `mock-api` — `createTask` returns a task with a fresh id; `deleteTask` prunes the id from other tasks'
  `dependsOn`; `deleteProject` cascades; ids never collide when two entities are created in succession.

That last case is a live bug: `addSubtask` derives the new id from `prev.flatMap(...)` while mapping over that same
`prev`. Verify two rapid additions yield `S-6` then `S-7`, not `S-6` twice.

Component tests are not required for this revision; §13 is verified by hand.

---

## 13. Acceptance criteria

**Build**

1. `cd frontend && bun run build` produces a static client bundle plus a prerendered shell, with no runtime server
   required; `bun run preview` serves it and the board works on a hard refresh.
2. Grepping `frontend/src` for `LOVABLE_API_KEY`, `process.env`, `@ai-sdk`, `from "ai"` and `/api/chat` returns
   nothing.
3. The Network tab shows zero application requests after load — fonts and static assets only.
4. `bun run lint` and `tsc --noEmit` pass under the existing strict config.
5. `@lovable.dev/vite-tanstack-config`, `@tanstack/react-start` and `@tanstack/react-router` are still dependencies
   and still in use.

**Data and state**

6. Creating a task through **New task** puts it in the chosen lane immediately, and in the graph.
7. Editing a task updates card, aside and graph with no reload.
8. Deleting `T-2` removes it everywhere and drops `T-2` from `T-3`'s Waiting on list.
9. Deleting **Carrot Ops** removes its tasks and any dangling references to them.
10. Subtask add / rename / toggle / delete works from the dialog and the card count updates.
11. Making `T-1` wait on `T-3` (which already waits on `T-1`) is refused with the loop toast and writes nothing.
12. No file outside `src/api/` and `board-store.tsx` imports `seed.ts`; no component mutates `tasks` directly.
13. Every `BoardApi` method returns a promise, and every call site awaits it.

**Interaction**

14. Dragging a card from Burrow to In motion changes its status; counts and graph update.
15. Dragging onto an empty lane works.
16. Dropping a blocked task into Harvested succeeds and warns.
17. `j` / `k` / `h` / `l` and the arrow keys move focus across all four lanes; focus is always visible.
18. `3` moves the focused card to **In motion** and focus follows it.
19. `n`, `e`, `/`, `b`, `g`, `?` and `Escape` all behave per §10.2, and none of them fire while typing in the filter.
20. On a touch viewport every card exposes a visible `⋯` menu that can move it between lanes.

**Visual**

21. Side by side with `main`, header, lanes, cards, badges, aside and graph are unchanged apart from §7's additions.
22. Space Grotesk and DM Sans load, the dot grid renders, no layout shift on first paint.
23. Each project's hue is visible on its chip and on its cards.

---

## 14. Preview of the Python backend — not built here

Recorded so §5 aims at something real.

- **`backend/`, managed with `uv`** — `pyproject.toml`, `uv.lock`, `uv run` for everything.
- FastAPI + Pydantic v2, serving the §5.2 contract.
- Pydantic models mirror §4 exactly, with `alias_generator=to_camel` and `populate_by_name=True` so the wire format
  stays camelCase and Python stays `snake_case`.
- SQLite via SQLAlchemy to start; the model is small and relational — `projects`, `tasks`, `subtasks`, and a
  `task_dependencies` join table for `dependsOn`.
- The cycle check (§8.4) must be enforced **server-side too**; client validation is a courtesy, not a guarantee.
- Dev wiring: Vite proxies `/api` to the FastAPI port, so the frontend keeps calling same-origin paths and no CORS
  configuration is needed in development.
- Frontend change when it lands: implement `http-api.ts` against `BoardApi` and switch which implementation
  `board-store.tsx` imports. Nothing else.

---

## 15. Implementation order

1. **Move** — `git mv` the app into `frontend/`; confirm `bun run dev` still boots. Nothing else changes.
2. **Remove the chat** — delete the files in §3.3 and the dependencies in §3.4; drop the *Ask Kanbunny* CTA.
   Verify criteria 2–5.
3. **SPA mode** — §3.2. Verify criteria 1 and 3.
4. **The API seam** — create `src/api/`, move the seed, write `mock-api.ts`, make the store async and delete the
   direct `TASKS` imports in `routes/index.tsx` and `DependencyGraph.tsx`. Verify criteria 6–9, 12, 13.
5. **Editing** — New task button, card overflow menu, delete confirms, subtask section, cycle guard.
   Verify criteria 10, 11.
6. **Drag and drop** — card `draggable`, lane targets, live region. Verify criteria 14–16.
7. **Keyboard** — the shortcuts hook, roving tabindex, shortcuts overlay. Verify criteria 17–20.
8. **Filter, hue, graph polish** — search input, project tinting, critical path toggle, empty states.
   Verify criteria 23.
9. **Tests** — vitest over §12.
10. **Visual pass** — compare against `main`, check contrast and breakpoints. Verify criteria 21, 22.

Steps 1–3 are mechanical and independently verifiable; land them before anything else.
