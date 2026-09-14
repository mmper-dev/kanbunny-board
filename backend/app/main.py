"""Application wiring.

Implements the contract in ../openapi.yaml. See ../README.md for how to run it.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .errors import install_error_handlers
from .routers import auth, health, projects, subtasks, tasks
from .seed import seed_demo_user
from .store import configure, describe

DESCRIPTION = """
Backend for the Kanbunny board. Implements the contract in `openapi.yaml`.

Storage is selected by `KANBUNNY_STORE`: `database` (default, `DATABASE_URL`) or `memory`, which
keeps everything in process for demos and loses it on restart.

Every endpoint under `/api` needs `Authorization: Bearer <token>` except `/api/auth/login`.
`/health` is public. Get a token from `POST /api/auth/login`.
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure(settings)
    print(f"Kanbunny storage: {describe()}")

    if settings.seed_demo:
        # only_if_empty so restarting against a database does not discard the user's work; in
        # memory mode the board is empty every time anyway, so it always reseeds.
        user_id = seed_demo_user(only_if_empty=settings.uses_database)
        print(f"Demo account '{settings.seed_username}' ({user_id}) ready.")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Kanbunny Board API",
        version="0.1.0",
        summary="The backend contract the Kanbunny frontend is built against.",
        description=DESCRIPTION,
        lifespan=lifespan,
    )

    # In development Vite proxies /api here, so this is belt and braces — it also lets the frontend
    # talk to the service directly, without a proxy.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(tasks.router)
    # Registered after tasks so /api/tasks/{task_id} is matched before the nested prefix.
    app.include_router(subtasks.router)

    return app


app = create_app()
