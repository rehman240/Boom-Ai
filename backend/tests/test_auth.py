from sqlalchemy import select

from app.config import get_settings
from app.models import Event, User

COOKIE = get_settings().session_cookie_name


def signup(client, email="Owner@Example.com", password="good-password"):
    return client.post("/auth/signup", json={"email": email, "password": password})


def test_signup_sets_cookie_and_stores_hashed_password(client, db):
    r = signup(client)
    assert r.status_code == 201
    assert r.json()["email"] == "owner@example.com"  # stored lowercase
    assert r.json()["workspace_name"] == "My workspace"
    assert "password" not in r.text
    assert COOKIE in r.cookies

    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie

    user = db.scalar(select(User).where(User.email == "owner@example.com"))
    assert user.password_hash != "good-password"
    assert db.scalar(select(Event).where(Event.name == "signup", Event.user_id == user.id))


def test_signup_rejects_duplicate_email_and_short_password(client):
    assert signup(client).status_code == 201
    assert signup(client, email="owner@example.com").status_code == 409
    assert signup(client, email="other@example.com", password="short").status_code == 422
    assert signup(client, email="not-an-email").status_code == 422


def test_login_and_me(client):
    signup(client)
    client.cookies.clear()

    assert client.get("/auth/me").status_code == 401

    r = client.post("/auth/login", json={"email": "OWNER@example.com", "password": "good-password"})
    assert r.status_code == 200
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"


def test_login_wrong_password_or_unknown_email_gives_same_error(client):
    signup(client)
    client.cookies.clear()
    wrong = client.post("/auth/login", json={"email": "owner@example.com", "password": "bad-password"})
    unknown = client.post("/auth/login", json={"email": "nobody@example.com", "password": "bad-password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_logout_clears_session(client):
    signup(client)
    assert client.post("/auth/logout").status_code == 204
    assert client.get("/auth/me").status_code == 401


def test_tampered_cookie_is_rejected(client):
    signup(client)
    token = client.cookies.get(COOKIE)
    client.cookies.set(COOKIE, token[:-2] + "xx")
    assert client.get("/auth/me").status_code == 401


def test_login_is_rate_limited(client):
    signup(client)
    codes = [
        client.post("/auth/login", json={"email": "owner@example.com", "password": "bad-password"}).status_code
        for _ in range(12)
    ]
    # 10/minute on the login path (signup has its own counter).
    assert codes == [401] * 10 + [429] * 2
