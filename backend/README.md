# BOOOM More backend

FastAPI + Postgres (SQLAlchemy, Alembic migrations). Python 3.13.

## Local setup

```bash
# 1. Start the local database (from the repo root). Runs on port 5434.
docker compose up -d db

# 2. Create a virtual env and install packages
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # Windows
# .venv/bin/pip install -r requirements-dev.txt     # macOS / Linux

# 3. Settings: copy the example and set SECRET_KEY
cp .env.example .env

# 4. Run migrations and start the API
.venv/Scripts/alembic upgrade head
.venv/Scripts/uvicorn app.main:app --reload
```

- API: http://localhost:8000, health check: `/health`, docs: `/docs` (hidden in production)
- Tests: `.venv/Scripts/python -m pytest`
- New migration: `.venv/Scripts/alembic revision --autogenerate -m "what changed"`

## Settings

All settings come from environment variables. See `.env.example`.
`postgres://` URLs from Supabase or Render are converted to the psycopg driver automatically.

## Docker

```bash
docker build -t boooom-more-api .
docker run -p 8000:8000 --env-file .env boooom-more-api
```

The container runs `alembic upgrade head` on start, then uvicorn on `$PORT` (default 8000).
