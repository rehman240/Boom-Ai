"""Model tests against the local Postgres. Each test runs in a transaction that is rolled back."""

import pytest
from sqlalchemy import select

from app.db import SessionLocal, engine
from app.models import AiJob, Brief, Event, JobStatus, Project, ProjectStage, ProjectStatus, User


@pytest.fixture
def db():
    conn = engine.connect()
    tx = conn.begin()
    session = SessionLocal(bind=conn, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    tx.rollback()
    conn.close()


def make_user(db) -> User:
    user = User(email="owner@example.com", password_hash="x")
    db.add(user)
    db.flush()
    return user


def test_defaults(db):
    user = make_user(db)
    project = Project(owner_id=user.id, name="NOVA Desk Lamp")
    db.add(project)
    db.flush()
    brief = Brief(project_id=project.id)
    db.add(brief)
    db.flush()
    db.refresh(project)
    db.refresh(brief)

    assert user.workspace_name == "My workspace"
    assert project.status == ProjectStatus.DRAFT
    assert project.stage == ProjectStage.BRIEF
    assert project.is_demo is False
    assert project.created_at is not None
    assert brief.currency == "USD"
    assert brief.brand_voice == []
    assert brief.summary is None


def test_deleting_user_removes_their_projects(db):
    user = make_user(db)
    project = Project(owner_id=user.id, name="Harbor Workshop")
    db.add(project)
    db.flush()
    db.add_all(
        [
            Brief(project_id=project.id),
            AiJob(project_id=project.id, kind="brief_summary"),
            Event(name="project_created", user_id=user.id, project_id=project.id),
        ]
    )
    db.flush()
    project_id = project.id

    db.delete(user)
    db.flush()
    db.expire_all()

    assert db.scalar(select(Project).where(Project.id == project_id)) is None
    assert db.scalar(select(Brief).where(Brief.project_id == project_id)) is None
    assert db.scalar(select(AiJob).where(AiJob.project_id == project_id)) is None
    # Events stay for counting, but lose their links to the deleted user and project.
    event = db.scalar(select(Event).where(Event.name == "project_created"))
    assert event.user_id is None and event.project_id is None


def test_job_defaults_to_queued(db):
    user = make_user(db)
    project = Project(owner_id=user.id, name="P")
    db.add(project)
    db.flush()
    job = AiJob(project_id=project.id, kind="brief_summary")
    db.add(job)
    db.flush()
    assert job.status == JobStatus.QUEUED
    assert job.attempts == 0
