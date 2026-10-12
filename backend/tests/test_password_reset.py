"""Forgot password: a one-time, expiring reset link by email."""

import re
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.mail import get_mailer
from app.main import app
from app.models import Event, User
from app.security import create_session_token

from tests.test_auth import COOKIE, signup


class Outbox:
    def __init__(self):
        self.sent: list[tuple[str, str, str]] = []

    def send(self, to, subject, text):
        self.sent.append((to, subject, text))

    def token(self) -> str:
        return re.search(r"/reset-password#token=(\S+)", self.sent[-1][2]).group(1)


@pytest.fixture
def outbox():
    box = Outbox()
    app.dependency_overrides[get_mailer] = lambda: box
    yield box
    app.dependency_overrides.pop(get_mailer, None)


def forgot(client, email="owner@example.com"):
    r = client.post("/auth/forgot-password", json={"email": email})
    assert r.status_code == 202, r.text
    return r.json()["detail"]


def reset(client, token, password="brand-new-password"):
    return client.post("/auth/reset-password", json={"token": token, "password": password})


def login(client, password):
    return client.post("/auth/login", json={"email": "owner@example.com", "password": password})


def test_a_reset_link_is_emailed_and_sets_a_new_password(client, db, outbox):
    signup(client)
    client.cookies.clear()
    forgot(client, "OWNER@example.com")  # any case
    to, subject, text = outbox.sent[0]
    assert to == "owner@example.com"
    assert "Reset your" in subject
    assert text.count(get_settings().app_url) == 1 and "60 minutes" in text

    r = reset(client, outbox.token())
    assert r.status_code == 200, r.text
    assert COOKIE in r.cookies  # signed in straight away
    assert client.get("/auth/me").status_code == 200
    assert login(client, "good-password").status_code == 401
    assert login(client, "brand-new-password").status_code == 200
    names = db.scalars(select(Event.name)).all()
    assert "password_reset_requested" in names and "password_reset" in names


def test_the_answer_is_the_same_for_an_unknown_email(client, outbox):
    signup(client)
    assert forgot(client) == forgot(client, "nobody@example.com")
    assert len(outbox.sent) == 1


def test_a_link_works_once(client, outbox):
    signup(client)
    forgot(client)
    token = outbox.token()
    assert reset(client, token).status_code == 200
    r = reset(client, token, "another-password")
    assert r.status_code == 400
    assert "expired or was already used" in r.json()["detail"]


def test_a_password_change_kills_older_links(client, outbox):
    signup(client)
    forgot(client)
    old = outbox.token()
    forgot(client)
    assert reset(client, outbox.token()).status_code == 200
    assert reset(client, old).status_code == 400


def test_an_expired_or_forged_link_is_refused(client, db, outbox):
    signup(client)
    user = db.scalar(select(User).where(User.email == "owner@example.com"))
    forgot(client)
    payload = jwt.decode(outbox.token(), get_settings().secret_key, algorithms=["HS256"])
    payload["exp"] = datetime.now(UTC) - timedelta(minutes=1)
    expired = jwt.encode(payload, get_settings().secret_key, algorithm="HS256")
    forged = jwt.encode({**payload, "exp": datetime.now(UTC) + timedelta(hours=1)}, "a-different-secret-key-of-enough-length!", algorithm="HS256")
    login_token = create_session_token(user.id, user.session_version)
    for token in (expired, forged, login_token, "not-a-token"):
        assert reset(client, token).status_code == 400


def test_a_reset_link_is_not_a_login(client, outbox):
    signup(client)
    client.cookies.clear()
    forgot(client)
    client.cookies.set(COOKIE, outbox.token())
    assert client.get("/auth/me").status_code == 401


def test_resetting_signs_out_other_devices(client, outbox):
    signup(client)
    other_device = client.cookies.get(COOKIE)
    forgot(client)
    assert reset(client, outbox.token()).status_code == 200
    client.cookies.clear()
    client.cookies.set(COOKIE, other_device)
    assert client.get("/auth/me").status_code == 401


def test_the_new_password_must_be_long_enough(client, outbox):
    signup(client)
    forgot(client)
    assert reset(client, outbox.token(), "short").status_code == 422
    assert login(client, "good-password").status_code == 200  # unchanged


def test_without_smtp_development_logs_the_email(caplog, monkeypatch):
    from app.mail import LogMailer

    monkeypatch.setattr(get_settings(), "app_env", "development")
    with caplog.at_level("INFO"):
        LogMailer().send("a@example.com", "Subject", "the link")
    assert "the link" in caplog.text
    caplog.clear()
    monkeypatch.setattr(get_settings(), "app_env", "production")
    with caplog.at_level("INFO"):
        LogMailer().send("a@example.com", "Subject", "the link")
    assert "the link" not in caplog.text and "SMTP_HOST is not set" in caplog.text


def test_reset_is_offered_only_when_email_can_be_sent(client, monkeypatch, outbox):
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "development")
    assert client.get("/auth/options").json() == {"password_reset": True}  # logged in development

    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "smtp_host", "")
    assert client.get("/auth/options").json() == {"password_reset": False}
    signup(client)
    r = client.post("/auth/forgot-password", json={"email": "owner@example.com"})
    assert r.status_code == 503 and not outbox.sent

    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    assert client.get("/auth/options").json() == {"password_reset": True}
