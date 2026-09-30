"""Shared fixtures. Tests use the local Postgres; every test's data is rolled back."""

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app.ai.provider import MockProvider, get_ai_provider
from app.db import SessionLocal, engine, get_db
from app.jobs import get_session_factory
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


class SwitchableProvider:
    """The AI provider for tests: the mock by default, swappable per test via `ai.use(...)`."""

    def __init__(self):
        self.inner = MockProvider()

    def use(self, provider):
        self.inner = provider

    @property
    def name(self):
        return self.inner.name

    @property
    def model(self):
        return self.inner.model

    def generate(self, task):
        return self.inner.generate(task)


@pytest.fixture
def ai():
    return SwitchableProvider()


@pytest.fixture
def client(db, storage, ai):
    reset_limits()

    @contextmanager
    def same_session():
        # Background jobs share the test's session, so their writes are rolled back too.
        yield db

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_ai_provider] = lambda: ai
    app.dependency_overrides[get_session_factory] = lambda: same_session
    yield TestClient(app)
    app.dependency_overrides.clear()
