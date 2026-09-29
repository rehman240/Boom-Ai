"""Shared fixtures. Tests use the local Postgres; every test's data is rolled back."""

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal, engine, get_db
from app.main import app
from app.rate_limit import reset_limits
from app.storage import LocalStorage, get_storage


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
def storage(tmp_path):
    """Uploads go to a temporary folder, not the real backend/uploads/."""
    return LocalStorage(tmp_path)


@pytest.fixture
def client(db, storage):
    reset_limits()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_storage] = lambda: storage
    yield TestClient(app)
    app.dependency_overrides.clear()
