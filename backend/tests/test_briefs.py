from sqlalchemy import select

from app.models import Brief, Project, ProjectStatus
from app.schemas.brief import REQUIRED_FIELDS

FULL = {
    "user_role": "business_owner",
    "business_name": "NOVA",
    "product_or_service": "Rechargeable desk lamp",
    "description": "A portable lamp for people who work in more than one place.",
    "differentiators": "Three light settings and a battery that lasts a week.",
    "goal": "Preorders",
    "target_location": "United States",
    "budget_amount": "12000.00",
}


def signup(client, email="owner@example.com"):
    return client.post("/auth/signup", json={"email": email, "password": "good-password"})


def start(client, name="NOVA Desk Lamp"):
    signup(client)
    return client.post("/projects", json={"name": name}).json()["id"]


def test_new_brief_is_empty_and_lists_everything_as_missing(client):
    project_id = start(client)
    r = client.get(f"/projects/{project_id}/brief")
    assert r.status_code == 200
    assert r.json()["brief"]["business_name"] is None
    assert r.json()["brief"]["currency"] == "USD"
    assert r.json()["brief"]["language"] == "English"
    assert set(r.json()["missing_required"]) == set(REQUIRED_FIELDS)


def test_autosave_only_touches_the_fields_it_sends(client):
    project_id = start(client)
    client.patch(f"/projects/{project_id}/brief", json={"business_name": "NOVA"})
    r = client.patch(f"/projects/{project_id}/brief", json={"goal": "Preorders"})

    # The earlier field is still there: a partial save must not erase existing work.
    assert r.json()["brief"]["business_name"] == "NOVA"
    assert r.json()["brief"]["goal"] == "Preorders"


def test_filling_everything_clears_the_missing_list(client):
    project_id = start(client)
    r = client.patch(f"/projects/{project_id}/brief", json=FULL)
    assert r.status_code == 200
    assert r.json()["missing_required"] == []
    assert r.json()["brief"]["budget_amount"] == "12000.00"


def test_clearing_a_field_makes_it_missing_again(client):
    project_id = start(client)
    client.patch(f"/projects/{project_id}/brief", json=FULL)
    r = client.patch(f"/projects/{project_id}/brief", json={"business_name": "   "})

    # Whitespace is stored as null, so "missing" means one thing everywhere.
    assert r.json()["brief"]["business_name"] is None
    assert r.json()["missing_required"] == ["business_name"]


def test_text_is_trimmed_and_choices_are_deduplicated(client):
    project_id = start(client)
    r = client.patch(
        f"/projects/{project_id}/brief",
        json={"business_name": "  NOVA  ", "brand_voice": ["Clear", "Clear", " Modern "], "channels": []},
    )
    assert r.json()["brief"]["business_name"] == "NOVA"
    assert r.json()["brief"]["brand_voice"] == ["Clear", "Modern"]
    assert r.json()["brief"]["channels"] == []


def test_rejects_bad_dates_urls_and_budgets(client):
    project_id = start(client)
    bad = [
        {"start_date": "2026-11-30", "end_date": "2026-11-01"},
        {"product_url": "nova.example.com"},
        {"budget_amount": "-5"},
        {"brand_voice": [f"voice-{i}" for i in range(9)]},  # distinct: duplicates collapse first
        {"business_name": "x" * 201},
    ]
    for body in bad:
        assert client.patch(f"/projects/{project_id}/brief", json=body).status_code == 422, body

    # A save with no fields at all is a client bug, not an empty brief.
    assert client.patch(f"/projects/{project_id}/brief", json={}).status_code == 400


def test_saving_moves_the_campaign_out_of_draft_and_updates_last_edited(client, db):
    project_id = start(client)
    project = db.get(Project, project_id)
    assert project.status == ProjectStatus.DRAFT
    edited_before = project.updated_at

    client.patch(f"/projects/{project_id}/brief", json={"business_name": "NOVA"})
    db.expire_all()
    project = db.get(Project, project_id)

    assert project.status == ProjectStatus.IN_PROGRESS
    assert project.updated_at >= edited_before


def test_another_users_brief_is_not_reachable(client):
    project_id = start(client)
    client.cookies.clear()
    signup(client, email="stranger@example.com")

    assert client.get(f"/projects/{project_id}/brief").status_code == 404
    assert client.patch(f"/projects/{project_id}/brief", json={"business_name": "Mine"}).status_code == 404


def test_demo_brief_can_be_read_but_not_edited(client, db):
    project_id = start(client, "Example campaign")
    db.get(Project, project_id).is_demo = True
    db.flush()

    assert client.get(f"/projects/{project_id}/brief").status_code == 200
    assert client.patch(f"/projects/{project_id}/brief", json={"business_name": "Mine"}).status_code == 403


def test_brief_is_recreated_if_it_is_somehow_missing(client, db):
    project_id = start(client)
    db.delete(db.scalar(select(Brief).where(Brief.project_id == project_id)))
    db.flush()

    assert client.get(f"/projects/{project_id}/brief").status_code == 200


def test_signed_out_user_cannot_read_a_brief(client):
    project_id = start(client)
    client.cookies.clear()
    assert client.get(f"/projects/{project_id}/brief").status_code == 401


def test_role_and_engine_chosen_when_creating_a_campaign_are_kept_on_the_brief(client):
    signup(client)
    project_id = client.post(
        "/projects", json={"name": "Agency job", "user_role": "agency", "ai_engine": "claude"}
    ).json()["id"]
    brief = client.get(f"/projects/{project_id}/brief").json()
    assert brief["brief"]["user_role"] == "agency"
    assert brief["brief"]["ai_engine"] == "claude"
    assert "user_role" not in brief["missing_required"]


def test_a_new_campaign_runs_on_claude_and_asks_who_is_making_it(client):
    project_id = start(client)
    brief = client.get(f"/projects/{project_id}/brief").json()
    assert brief["brief"]["ai_engine"] == "claude"
    assert "user_role" in brief["missing_required"]


def test_engines_that_are_coming_soon_are_refused(client):
    signup(client)
    assert client.post("/projects", json={"name": "X", "ai_engine": "chatgpt"}).status_code == 422
    project_id = client.post("/projects", json={"name": "Y"}).json()["id"]
    assert client.patch(f"/projects/{project_id}/brief", json={"ai_engine": "booom"}).status_code == 422
    assert client.patch(f"/projects/{project_id}/brief", json={"user_role": "spy"}).status_code == 422
    # Sending no engine leaves the current one in place.
    r = client.patch(f"/projects/{project_id}/brief", json={"ai_engine": None, "goal": "Leads"})
    assert r.json()["brief"]["ai_engine"] == "claude"


def test_duplicating_keeps_the_role_and_engine(client):
    signup(client)
    source = client.post("/projects", json={"name": "S", "user_role": "research"}).json()["id"]
    copy = client.post(f"/projects/{source}/duplicate").json()["id"]
    assert client.get(f"/projects/{copy}/brief").json()["brief"]["user_role"] == "research"
