"""Shared fixtures. Tests use the local Postgres; every test's data is rolled back."""

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal, engine, get_db
from app.main import app
from app.rate_limit import reset_limits


@pytest.fixture
def db():
    conn = engine.connect()
    tx = conn.begin()
    session = SessionLocal(bind=conn, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    tx.rollback()
    conn.close()


@pytest.fixture
def client(db):
    reset_limits()
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()
