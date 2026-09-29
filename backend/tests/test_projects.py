from sqlalchemy import select

from app.models import Brief, Event, Project, ProjectStatus, User


def signup(client, email="owner@example.com"):
    return client.post("/auth/signup", json={"email": email, "password": "good-password"})


def create(client, name="NOVA Desk Lamp"):
    return client.post("/projects", json={"name": name})


def test_create_lists_and_makes_an_empty_brief(client, db):
    signup(client)
    r = create(client)
    assert r.status_code == 201
    project_id = r.json()["id"]
    assert r.json()["name"] == "NOVA Desk Lamp"
    assert r.json()["status"] == ProjectStatus.DRAFT
    assert r.json()["is_demo"] is False

    # Autosave needs a brief row to write into from the very first keystroke.
    assert db.scalar(select(Brief).where(Brief.project_id == project_id)) is not None
    assert db.scalar(select(Event).where(Event.name == "project_created", Event.project_id == project_id))

    listed = client.get("/projects").json()
    assert [p["name"] for p in listed["projects"]] == ["NOVA Desk Lamp"]
    assert listed["stats"] == {"active_campaigns": 1, "assets_drafted": 0, "ready_to_export": 0}


def test_list_is_newest_edited_first(client):
    signup(client)
    first = create(client, "First").json()
    create(client, "Second")
    client.patch(f"/projects/{first['id']}", json={"name": "First, edited"})

    names = [p["name"] for p in client.get("/projects").json()["projects"]]
    assert names == ["First, edited", "Second"]


def test_name_is_required_and_trimmed(client):
    signup(client)
    assert create(client, "   ").status_code == 422
    assert create(client, "x" * 201).status_code == 422
    assert create(client, "  Spaced   out  ").json()["name"] == "Spaced out"


def test_duplicate_copies_the_brief_but_not_the_confirmation(client, db):
    signup(client)
    project_id = create(client).json()["id"]
    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    brief.business_name = "NOVA"
    brief.summary = {"facts": ["rechargeable"]}
    brief.summary_confirmed_at = "2026-09-29T10:00:00+00:00"
    db.flush()

    r = client.post(f"/projects/{project_id}/duplicate")
    assert r.status_code == 201
    assert r.json()["name"] == "NOVA Desk Lamp (copy)"

    copy = db.scalar(select(Brief).where(Brief.project_id == r.json()["id"]))
    assert copy.business_name == "NOVA"
    assert copy.summary == {"facts": ["rechargeable"]}
    # The copy is a new campaign, so the user confirms its facts again.
    assert copy.summary_confirmed_at is None


def test_delete_removes_the_brief_and_keeps_the_event(client, db):
    signup(client)
    project_id = create(client).json()["id"]

    assert client.delete(f"/projects/{project_id}").status_code == 204
    assert db.get(Project, project_id) is None
    assert db.scalar(select(Brief).where(Brief.project_id == project_id)) is None
    user_id = db.scalar(select(User.id).where(User.email == "owner@example.com"))
    assert db.scalar(select(Event).where(Event.name == "project_deleted", Event.user_id == user_id))


def test_another_users_project_looks_like_it_does_not_exist(client):
    signup(client)
    project_id = create(client).json()["id"]

    client.cookies.clear()
    signup(client, email="stranger@example.com")

    # 404 rather than 403, so an id cannot be confirmed by probing.
    assert client.get(f"/projects/{project_id}").status_code == 404
    assert client.patch(f"/projects/{project_id}", json={"name": "Mine now"}).status_code == 404
    assert client.post(f"/projects/{project_id}/duplicate").status_code == 404
    assert client.delete(f"/projects/{project_id}").status_code == 404
    assert client.get("/projects").json()["projects"] == []


def test_signed_out_user_gets_401(client):
    assert client.get("/projects").status_code == 401
    assert create(client).status_code == 401


def test_demo_project_is_read_only_but_can_be_duplicated(client, db):
    signup(client)
    project_id = create(client, "Example campaign").json()["id"]
    db.get(Project, project_id).is_demo = True
    db.flush()

    assert client.patch(f"/projects/{project_id}", json={"name": "Renamed"}).status_code == 403
    assert client.delete(f"/projects/{project_id}").status_code == 403

    copy = client.post(f"/projects/{project_id}/duplicate")
    assert copy.status_code == 201
    assert copy.json()["is_demo"] is False


def test_stats_count_each_status(client, db):
    signup(client)
    ready = create(client, "Ready").json()["id"]
    create(client, "Draft")
    db.get(Project, ready).status = ProjectStatus.READY
    db.flush()

    stats = client.get("/projects").json()["stats"]
    assert stats["active_campaigns"] == 1
    assert stats["ready_to_export"] == 1
