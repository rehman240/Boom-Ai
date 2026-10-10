"""Manage Conversions: the measurement plan and the results the user enters (client brief 4.8)."""

import json
from datetime import date

import pytest
from sqlalchemy import select

from app import measurement
from app.models import Event, MetricEntry, Project, ProjectStage

from tests.test_audiences import confirmed_project
from tests.test_brief_summary import ready_project


def stage(client, project_id):
    r = client.get(f"/projects/{project_id}/conversions")
    assert r.status_code == 200, r.text
    return r.json()


def with_plan(client, **brief):
    project_id = confirmed_project(client, **brief)
    r = client.post(f"/projects/{project_id}/conversions/plan")
    assert r.status_code == 201, r.text
    return project_id, r.json()["plan"]


def add(client, project_id, **entry):
    r = client.post(f"/projects/{project_id}/conversions/entries", json={"period": "Week 1", **entry})
    assert r.status_code == 201, r.text
    return r.json()


def result(state, key):
    return next(r for r in state["results"] if r["key"] == key)


# --- The plan -----------------------------------------------------------------------------


def test_the_plan_waits_for_a_confirmed_brief(client):
    project_id = ready_project(client)
    state = stage(client, project_id)
    assert state["blocked_reason"] == "Confirm the brief summary first."
    assert client.post(f"/projects/{project_id}/conversions/plan").status_code == 409
    r = client.post(f"/projects/{project_id}/conversions/entries", json={"period": "Week 1", "leads": 3})
    assert r.status_code == 409


def test_the_plan_starts_from_the_brief_and_a_template_for_its_goal(client, db):
    project_id, plan = with_plan(
        client, product_url="https://nova.example/lamp", channels=["Instagram", "Email"],
        start_date="2026-11-01", end_date="2026-11-30",
    )
    data = plan["data"]
    assert data["goal"] == "Preorders"
    assert data["landing_url"] == "https://nova.example/lamp"
    assert data["review_cadence"] == "weekly"
    texts = " ".join(step["text"] for step in data["checklist"])
    assert "order confirmation" in texts  # preorders are sales
    assert "each email" in texts  # Email is one of the channels
    assert all(step["done"] is False for step in data["checklist"])
    assert plan["review_dates"] == ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29", "2026-11-30"]
    assert db.get(Project, project_id).stage == ProjectStage.CONVERSIONS

    # A second call changes nothing.
    again = client.post(f"/projects/{project_id}/conversions/plan").json()["plan"]
    assert again["id"] == plan["id"] and again["data"] == data


@pytest.mark.parametrize(
    ("goal", "kind"),
    [("Preorders", "sales"), ("Buy online", "sales"), ("Newsletter sign ups", "leads"), ("Book a demo", "leads"),
     ("Brand awareness", "general"), ("", "general")],
)
def test_the_checklist_follows_the_goal_in_the_users_own_words(goal, kind):
    assert measurement.goal_kind(goal) == kind


@pytest.mark.parametrize(
    ("start", "end", "cadence"),
    [(date(2026, 11, 1), date(2026, 11, 5), "daily"), (date(2026, 11, 1), date(2026, 11, 14), "twice_weekly"),
     (date(2026, 11, 1), date(2027, 3, 1), "every_two_weeks"), (None, None, "weekly")],
)
def test_short_campaigns_are_reviewed_more_often(start, end, cadence):
    assert measurement.default_cadence(start, end) == cadence


def test_review_dates_always_end_on_the_last_day_and_need_dates():
    assert measurement.review_dates("end_only", date(2026, 11, 1), date(2026, 11, 30)) == [date(2026, 11, 30)]
    assert measurement.review_dates("daily", date(2026, 11, 1), date(2026, 11, 3)) == [date(2026, 11, 2), date(2026, 11, 3)]
    assert measurement.review_dates("weekly", None, date(2026, 11, 3)) == []


def test_the_plan_is_edited_versioned_and_approved_like_any_item(client):
    project_id, plan = with_plan(client)
    steps = plan["data"]["checklist"] + [{"id": "mine", "text": "Tell the shop staff about the campaign.", "done": False}]
    r = client.patch(
        f"/projects/{project_id}/items/{plan['id']}",
        json={"data": {"goal": "Preorders on the website", "review_cadence": "daily", "checklist": steps}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["checklist"][-1]["id"] == "mine"
    bad = client.patch(f"/projects/{project_id}/items/{plan['id']}", json={"data": {"review_cadence": "hourly"}})
    assert bad.status_code == 422
    assert client.post(f"/projects/{project_id}/items/{plan['id']}/versions", json={"label": "v1"}).status_code == 201
    assert client.post(f"/projects/{project_id}/items/{plan['id']}/approve").json()["approved_at"]


def test_ticking_a_step_keeps_the_approval_and_makes_no_version(client):
    project_id, plan = with_plan(client)
    client.post(f"/projects/{project_id}/items/{plan['id']}/approve")
    step = plan["data"]["checklist"][0]
    r = client.put(f"/projects/{project_id}/conversions/plan/checklist/{step['id']}", json={"done": True})
    assert r.status_code == 200, r.text
    after = r.json()["plan"]
    assert after["data"]["checklist"][0]["done"] is True
    assert after["approved_at"] is not None
    assert after["version"] == plan["version"]
    assert client.put(f"/projects/{project_id}/conversions/plan/checklist/nope", json={"done": True}).status_code == 404


# --- Results ------------------------------------------------------------------------------


def test_no_results_yet_says_what_to_add(client):
    project_id, _ = with_plan(client)
    state = stage(client, project_id)
    assert state["entries"] == []
    assert state["totals"] == {"spend_cents": None, "leads": None, "sales": None, "revenue_cents": None}
    for r in state["results"]:
        assert r["value"] is None
        assert r["missing"]
    assert result(state, "cost_per_lead")["missing"] == "Add your first results to see this."
    assert result(state, "budget_used")["missing"] == "Add your spend to see this."


def test_entered_results_give_the_simple_calculations(client):
    project_id, _ = with_plan(client)
    add(client, project_id, spend_cents=150_000, leads=60, sales=12, revenue_cents=540_000)
    state = add(client, project_id, period="Week 2", spend_cents=50_000, leads=40, sales=8, revenue_cents=180_000)

    assert state["totals"] == {"spend_cents": 200_000, "leads": 100, "sales": 20, "revenue_cents": 720_000}
    assert result(state, "cost_per_lead")["value"] == 2_000  # $20.00, in cents
    assert result(state, "cost_per_sale")["value"] == 10_000
    assert result(state, "lead_to_sale")["value"] == 20
    assert result(state, "roas")["value"] == 3.6
    assert result(state, "budget_used")["value"] == pytest.approx(16.6667)  # of $12,000
    assert all(r["definition"] for r in state["results"])
    assert all(r["missing"] is None and r["note"] is None for r in state["results"])


def test_a_missing_figure_is_said_plainly_and_never_skews_a_result(client):
    project_id, _ = with_plan(client)
    state = add(client, project_id, spend_cents=100_000)
    assert result(state, "cost_per_lead")["missing"] == "Add spend and leads in the same entry to see cost per lead."
    assert result(state, "roas")["missing"] == "Add revenue and spend in the same entry to see return on ad spend."

    # Week 2 has leads but no spend: only week 3, which has both, counts.
    add(client, project_id, period="Week 2", leads=50)
    state = add(client, project_id, period="Week 3", spend_cents=30_000, leads=10)
    cpl = result(state, "cost_per_lead")
    assert cpl["value"] == 3_000
    assert cpl["note"] == "Based on 1 of 3 entries; the others are missing spend or leads."

    state = add(client, project_id, period="Week 4", spend_cents=0, sales=0, leads=0)
    assert result(state, "cost_per_sale")["missing"] == "No sales yet, so there is no cost per sale."


def test_an_entry_needs_a_period_and_a_figure_and_no_negative_numbers(client):
    project_id, _ = with_plan(client)
    url = f"/projects/{project_id}/conversions/entries"
    assert client.post(url, json={"period": "  ", "leads": 1}).status_code == 422
    r = client.post(url, json={"period": "Week 1"})
    assert r.status_code == 422
    assert "at least one figure" in r.json()["detail"][0]["msg"]
    assert client.post(url, json={"period": "Week 1", "leads": -1}).status_code == 422


def test_an_entry_can_be_changed_and_deleted(client, db):
    project_id, _ = with_plan(client)
    entry = add(client, project_id, spend_cents=100_000, leads=10)["entries"][0]
    r = client.put(
        f"/projects/{project_id}/conversions/entries/{entry['id']}", json={"period": "Nov 1-7", "leads": 20}
    )
    assert r.status_code == 200, r.text
    changed = r.json()["entries"][0]
    assert changed["period"] == "Nov 1-7" and changed["leads"] == 20
    assert changed["spend_cents"] is None  # cleared in the form, cleared here
    r = client.delete(f"/projects/{project_id}/conversions/entries/{entry['id']}")
    assert r.json()["entries"] == []
    assert client.delete(f"/projects/{project_id}/conversions/entries/{entry['id']}").status_code == 404


def test_results_are_private_and_in_the_data_export_but_not_in_events(client, db):
    project_id, plan = with_plan(client)
    add(client, project_id, spend_cents=123_456, leads=7)
    data = json.loads(client.get("/account/export").text)
    campaign = data["campaigns"][0]
    assert campaign["results"][0]["spend_cents"] == 123_456
    assert any(w["id"] == plan["id"] and w["versions"] for w in campaign["work"])

    # Events hold a name and ids only, so the figures can't reach them.
    names = db.scalars(select(Event.name).where(Event.project_id == project_id)).all()
    assert "results_entered" in names

    entry_id = db.scalar(select(MetricEntry.id).where(MetricEntry.project_id == project_id))
    client.post("/auth/logout")
    client.post("/auth/signup", json={"email": "other@example.com", "password": "good-password"})
    assert client.get(f"/projects/{project_id}/conversions").status_code == 404
    r = client.put(f"/projects/{project_id}/conversions/entries/{entry_id}", json={"period": "x", "leads": 1})
    assert r.status_code == 404
