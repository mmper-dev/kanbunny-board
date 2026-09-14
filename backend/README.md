# Kanbunny backend

FastAPI service implementing [`../openapi.yaml`](../openapi.yaml), the contract the frontend is
built against.

**The store is in memory.** Boards, tasks and user accounts all live in process and are gone on
restart; the demo account and its board are recreated at startup. Swapping in a real database means
replacing `app/store.py` — no router changes.

## Running it

Needs [uv](https://docs.astral.sh/uv/).

```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- Interactive docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

```sh
uv run pytest
```

## Signing in

Everything under `/api` needs a bearer token except `/api/auth/login`. `/health` is public.

```sh
curl -s localhost:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"mila","password":"carrots123"}'
```

Then send the `accessToken` back as `Authorization: Bearer <token>`.

The demo credentials are **`mila` / `carrots123`**, overridable with `KANBUNNY_SEED_USERNAME` and
`KANBUNNY_SEED_PASSWORD`. They exist to make the board show something; they are not a security
boundary.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `KANBUNNY_SECRET_KEY` | a known dev value | **Set this.** Tokens are signed with it; the default is public, so anyone can mint a valid token. The service warns at startup when it is unset. |
| `KANBUNNY_TOKEN_TTL_MINUTES` | `720` | Token lifetime. |
| `KANBUNNY_CORS_ORIGINS` | `localhost:8080,8081,5173` | Comma-separated. Unused if the frontend proxies `/api`. |
| `KANBUNNY_SEED_USERNAME` | `mila` | Demo account. |
| `KANBUNNY_SEED_PASSWORD` | `carrots123` | Demo account. |

## Layout

```
app/
  main.py       app construction, middleware, router wiring
  config.py     environment-backed settings
  models.py     wire models — camelCase on the wire, snake_case in Python
  store.py      in-memory board store: ids, cascades, the acyclic invariant
  auth.py       users, bcrypt hashing, JWT issue and verify, the route guard
  seed.py       demo data, mirroring frontend/src/api/seed.ts
  errors.py     domain errors and the handlers that render the contract's shape
  routers/      auth, tasks, subtasks, projects, health
tests/
```

Routers do no data logic: they authenticate, validate a body, call the store, and return what it
gives back. Every invariant — id generation, cascading deletes, cycle rejection — lives in the
store, so it holds no matter which route reaches it.

## Notes on behaviour worth knowing

- **Passwords** are bcrypt-hashed with a per-password salt. A login for an unknown user still runs
  a hash so it takes the same time as a wrong password, and both return the same message.
- **Dependency cycles** are rejected with `409` and nothing is written. The frontend performs the
  same check before sending; this is the enforcement. A diamond (`A→B`, `A→C`, `B→D`, `C→D`) is not
  a cycle and is accepted.
- **Another user's entity is a `404`, not a `403`** — the API does not confirm that an id exists to
  someone who cannot see it.
- **Deletes cascade.** Deleting a task prunes its id from every other task's `dependsOn`; deleting
  a project deletes its tasks and prunes references to them.
- **Errors** all use the contract's shape — `{code, message, details}` — including request
  validation failures, which FastAPI would otherwise return as `{"detail": ...}` that the frontend
  cannot parse. `message` is written to be shown to a person.

## Tests

`tests/test_contract.py` diffs this service's generated OpenAPI against `../openapi.yaml`: paths,
methods, operation ids, success codes, documented error codes, and which endpoints are public. Add
a route without documenting it and that test fails.
