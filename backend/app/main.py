from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.rate_limit import GlobalRateLimitMiddleware
from app.routers import account, auth, briefs, health, projects, uploads


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="BOOOM More API",
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
    return app


app = create_app()
