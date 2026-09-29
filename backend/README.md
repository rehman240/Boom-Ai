# BOOOM More backend

FastAPI + Postgres (SQLAlchemy, Alembic migrations). Python 3.13.

## Local setup

### 1. Database

Use any local Postgres 17. Create the role and database once:

```bash
psql -U postgres -c "CREATE ROLE boooom WITH LOGIN PASSWORD 'boooom';"
psql -U postgres -c "CREATE DATABASE boooom_more OWNER boooom;"
```

Then set `DATABASE_URL` in `.env` to match your port (default `5432`).

No local Postgres? `docker compose up -d db` from the repo root starts one on port 5434
instead; change the port in `DATABASE_URL` to `5434`.

### 2. The app

```bash

# Create a virtual env and install packages
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # Windows
# .venv/bin/pip install -r requirements-dev.txt     # macOS / Linux

# Settings: copy the example and set SECRET_KEY
cp .env.example .env

# Run migrations and start the API
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
