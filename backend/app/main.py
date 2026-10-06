import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.brand import APP_NAME
from app.config import get_settings
from app.rate_limit import GlobalRateLimitMiddleware
from app.routers import account, audiences, auth, briefs, health, items, jobs, projects, uploads


def create_app() -> FastAPI:
    settings = get_settings()
    # App logs (job failures and the like) go to stdout next to uvicorn's, where the host
    # collects them. Log lines carry ids and error types only, never campaign text.
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")
    app = FastAPI(
        title=f"{APP_NAME} API",
        # Hide interactive docs in production.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    app.add_middleware(GlobalRateLimitMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,  # auth uses an httpOnly cookie
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(account.router)
    app.include_router(briefs.router)
    app.include_router(uploads.router)
    app.include_router(jobs.router)
    app.include_router(items.router)
    app.include_router(audiences.router)
    return app


app = create_app()
