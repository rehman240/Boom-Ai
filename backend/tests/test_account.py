import json
from decimal import Decimal

from sqlalchemy import select

from app.models import Brief, Event, Project, User

PASSWORD = "good-password"


def signup(client, email="owner@example.com"):
    return client.post("/auth/signup", json={"email": email, "password": PASSWORD})


def test_rename_workspace(client):
    signup(client)
    r = client.patch("/account", json={"workspace_name": "  Nova   Studio  "})
    assert r.status_code == 200
    assert r.json()["workspace_name"] == "Nova Studio"
    assert client.get("/auth/me").json()["workspace_name"] == "Nova Studio"
    assert client.patch("/account", json={"workspace_name": "  "}).status_code == 422


def test_change_email_needs_the_password(client):
    signup(client)
    assert client.post("/account/email", json={"email": "new@example.com", "password": "wrong"}).status_code == 401
    assert client.get("/auth/me").json()["email"] == "owner@example.com"

    r = client.post("/account/email", json={"email": "New@Example.com", "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["email"] == "new@example.com"
    assert client.get("/auth/me").json()["email"] == "new@example.com"


def test_change_email_rejects_one_already_taken(client):
    signup(client, email="taken@example.com")
    client.cookies.clear()
    signup(client, email="owner@example.com")
    assert client.post("/account/email", json={"email": "taken@example.com", "password": PASSWORD}).status_code == 409


def test_change_password_and_sign_in_with_the_new_one(client, db):
    signup(client)
    assert (
        client.post("/account/password", json={"current_password": "wrong", "new_password": "new-password"}).status_code
        == 401
    )
    assert (
        client.post("/account/password", json={"current_password": PASSWORD, "new_password": "short"}).status_code == 422
    )

    r = client.post("/account/password", json={"current_password": PASSWORD, "new_password": "new-password-1"})
    assert r.status_code == 204
    # Still signed in here: the response carries a fresh cookie.
    assert client.get("/auth/me").status_code == 200
    assert db.scalar(select(Event).where(Event.name == "password_changed"))

    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "owner@example.com", "password": PASSWORD}).status_code == 401
    assert client.post("/auth/login", json={"email": "owner@example.com", "password": "new-password-1"}).status_code == 200


def test_changing_the_password_signs_other_devices_out(client):
    signup(client)
    other_device = client.cookies.get("boooom_session")

    client.post("/account/password", json={"current_password": PASSWORD, "new_password": "new-password-1"})

    client.cookies.clear()
    client.cookies.set("boooom_session", other_device)
    assert client.get("/auth/me").status_code == 401


def test_export_contains_the_campaigns_but_never_the_password(client, db):
    signup(client)
    project_id = client.post("/projects", json={"name": "NOVA Desk Lamp"}).json()["id"]
    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    brief.business_name = "NOVA"
    brief.budget_amount = Decimal("1500.00")
    db.flush()

    r = client.get("/account/export")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]

    data = json.loads(r.text)
    assert data["account"]["email"] == "owner@example.com"
    assert [c["name"] for c in data["campaigns"]] == ["NOVA Desk Lamp"]
    assert data["campaigns"][0]["brief"]["business_name"] == "NOVA"
    assert float(data["campaigns"][0]["brief"]["budget_amount"]) == 1500.0
    assert "password" not in r.text.lower()
    assert "owner_id" not in r.text


def test_export_of_an_empty_account_still_works(client):
    signup(client)
    data = json.loads(client.get("/account/export").text)
    assert data["campaigns"] == []


def test_delete_account_removes_everything(client, db):
    signup(client)
    project_id = client.post("/projects", json={"name": "NOVA Desk Lamp"}).json()["id"]
    user_id = db.scalar(select(User.id).where(User.email == "owner@example.com"))

    assert client.post("/account/delete", json={"password": "wrong"}).status_code == 401
    assert db.get(User, user_id) is not None

    assert client.post("/account/delete", json={"password": PASSWORD}).status_code == 204
    db.expire_all()
    assert db.get(User, user_id) is None
    assert db.get(Project, project_id) is None
    assert db.scalar(select(Brief).where(Brief.project_id == project_id)) is None


def test_account_routes_need_a_signed_in_user(client):
    assert client.patch("/account", json={"workspace_name": "X"}).status_code == 401
    assert client.get("/account/export").status_code == 401
    assert client.post("/account/delete", json={"password": PASSWORD}).status_code == 401
