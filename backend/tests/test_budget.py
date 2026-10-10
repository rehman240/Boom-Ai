"""Allocate Budget: a channel split that always adds up to the budget (client brief 4.7)."""

import pytest

from app import budget_math
from app.ai import budget
from app.models import JobStatus, Project, ProjectStage

from tests.test_assets import with_direction
from tests.test_audiences import RecordingProvider, confirmed_project
from tests.test_brief_summary import FailingProvider, FixedProvider

TOTAL = 1_200_000  # the brief's $12,000, in cents


def stage(client, project_id):
    r = client.get(f"/projects/{project_id}/budget")
    assert r.status_code == 200, r.text
    return r.json()


def generate(client, project_id):
    r = client.post(f"/projects/{project_id}/budget/generate")
    assert r.status_code == 202, r.text
    return r.json()


def planned(client):
    project_id = with_direction(client)
    generate(client, project_id)
    return project_id, stage(client, project_id)["plan"]


def amounts(plan):
    return {line["channel"]: line["amount_cents"] for line in plan["data"]["lines"]}


def total_of(plan):
    return sum(line["amount_cents"] for line in plan["data"]["lines"])


def suggestion(**extra):
    return {
        "lines": [
            {"channel": "Instagram", "role": "Reach", "percent": 50},
            {"channel": "Google Search", "role": "Capture interest", "percent": 30},
            {"channel": "Email", "role": "Follow up", "percent": 20},
        ],
        "reasoning": "Show the lamp, then catch people who search for one.",
        "assumptions": ["No past ad data."],
        "based_on": [{"source": "goal", "detail": "Preorders"}],
        "production_needs": ["Product photos"],
        **extra,
    }


# --- The arithmetic -----------------------------------------------------------------------


@pytest.mark.parametrize("total", [0, 1, 100, 99_999, 1_200_000, 333_334])
@pytest.mark.parametrize("weights", [[1], [45, 35, 20], [1, 1, 1], [33, 33, 33], [0, 0], [70, 0, 30]])
def test_a_split_always_adds_up_to_the_total_exactly(total, weights):
    out = budget_math.split(total, weights)
    assert sum(out) == total
    assert all(a >= 0 for a in out)


def test_a_split_follows_the_shares_and_gives_leftover_cents_fairly():
    assert budget_math.split(1_200_000, [45, 35, 20]) == [540_000, 420_000, 240_000]
    assert budget_math.split(100, [1, 1, 1]) == [34, 33, 33]
    assert budget_math.split(90, [0, 0, 0]) == [30, 30, 30]


def test_rebalancing_moves_only_the_free_lines():
    lines = [
        {"id": "a", "amount_cents": 500, "locked": True},
        {"id": "b", "amount_cents": 300, "locked": False},
        {"id": "c", "amount_cents": 200, "locked": False},
    ]
    changed = [{**lines[0]}, {**lines[1], "amount_cents": 400}, {**lines[2]}]
    out = budget_math.rebalance(changed, 1000, {"b"})
    assert [line["amount_cents"] for line in out] == [500, 400, 100]
    assert lines[1]["amount_cents"] == 300  # the input is left alone


def test_rebalancing_refuses_more_than_the_budget_or_nowhere_to_move():
    lines = [{"id": "a", "amount_cents": 600, "locked": True}, {"id": "b", "amount_cents": 400, "locked": False}]
    with pytest.raises(budget_math.BudgetError, match="more than the budget"):
        budget_math.rebalance([lines[0], {**lines[1], "amount_cents": 500}], 1000, {"b"})
    with pytest.raises(budget_math.BudgetError, match="Unlock another channel"):
        budget_math.rebalance([{**lines[0], "amount_cents": 500}, {**lines[1], "locked": True}], 1000, {"a"})


# --- Generating ---------------------------------------------------------------------------


def test_the_budget_waits_for_a_chosen_direction(client):
    project_id = confirmed_project(client)
    assert stage(client, project_id)["blocked_reason"] == "Choose a primary audience first."
    assert client.post(f"/projects/{project_id}/budget/generate").status_code == 409


def test_generating_makes_a_plan_that_adds_up_to_the_brief_budget(client, db):
    project_id = with_direction(client)
    state = stage(client, project_id)
    assert state["plan"] is None and state["blocked_reason"] is None
    assert state["total_cents"] == TOTAL

    job = generate(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.SUCCEEDED
    state = stage(client, project_id)
    plan = state["plan"]
    assert plan["data"]["total_cents"] == TOTAL
    assert total_of(plan) == TOTAL
    # The brief listed Instagram and Email, so the mix uses those.
    assert set(amounts(plan)) == {"Instagram", "Email"}
    assert sum(plan["percents"].values()) == pytest.approx(100)
    assert plan["data"]["production"][0]["amount_cents"] is None  # no invented costs
    assert plan["outdated"] is False and plan["total_changed"] is False
    assert plan["review_flags"] == []
    assert db.get(Project, project_id).stage == ProjectStage.BUDGET
    [first] = client.get(f"/projects/{project_id}/items/{plan['id']}/versions").json()
    assert first["prompt_version"] == budget.PROMPT_VERSION


def test_shares_that_dont_add_up_to_100_still_spend_exactly_the_budget(client, ai):
    project_id = with_direction(client)
    lines = [
        {"channel": "Instagram", "role": "Reach", "percent": 50},
        {"channel": "Instagram", "role": "Again", "percent": 10},
        {"channel": "Email", "role": "Follow up", "percent": 33},
    ]
    ai.use(FixedProvider(suggestion(lines=lines)))
    generate(client, project_id)
    plan = stage(client, project_id)["plan"]
    assert total_of(plan) == TOTAL
    assert list(amounts(plan)) == ["Instagram", "Email"]  # the repeat is merged


def test_the_ai_is_told_the_rules_and_never_writes_amounts(client, ai):
    project_id = with_direction(client)
    recorder = RecordingProvider()
    ai.use(recorder)
    generate(client, project_id)
    task = recorder.tasks[-1]
    assert task.name == "budget"
    assert "Do not write money amounts" in task.system
    assert "Do not forecast" in task.system
    assert "direction" in task.facts["context"]
    assert "amount" not in str(task.schema)


def test_figures_the_ai_made_up_are_flagged_but_the_plans_own_shares_are_not(client, ai):
    project_id = with_direction(client)
    ai.use(FixedProvider(suggestion(reasoning="Instagram gets 50% of the $12,000. Expect 4,000 preorders.")))
    generate(client, project_id)
    flags = stage(client, project_id)["plan"]["review_flags"]
    assert [f["claim"] for f in flags] == ["Figures not in your brief: 4000"]


def test_a_failed_or_malformed_generation_keeps_the_plan(client, ai):
    project_id, plan = planned(client)
    ai.use(FailingProvider(retryable=False))
    job = generate(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.FAILED
    ai.use(FixedProvider({"lines": "everything on TikTok"}))
    generate(client, project_id)
    after = stage(client, project_id)
    assert after["job"]["error"] == "The AI answer was not in the expected format."
    assert after["plan"]["data"] == plan["data"]


def test_generating_again_keeps_the_users_edits_and_costs_but_never_touches_an_approved_plan(client, ai):
    project_id, plan = planned(client)
    first = plan["data"]["lines"][0]
    client.patch(f"/projects/{project_id}/budget/lines/{first['id']}", json={"amount_cents": 1_000_000})
    production = [{**plan["data"]["production"][0], "amount_cents": 80_000}]
    client.patch(f"/projects/{project_id}/items/{plan['id']}", json={"data": {"production": production}})

    ai.use(FixedProvider(suggestion()))
    generate(client, project_id)
    after = stage(client, project_id)["plan"]
    assert set(amounts(after)) == {"Instagram", "Google Search", "Email"}
    assert after["data"]["production"][0]["amount_cents"] == 80_000  # the user's own cost stays
    history = client.get(f"/projects/{project_id}/items/{plan['id']}/versions").json()
    assert [h["source"] for h in history] == ["generated", "kept_edits", "generated"]
    assert history[1]["data"]["lines"][0]["amount_cents"] == 1_000_000

    client.post(f"/projects/{project_id}/items/{plan['id']}/approve")
    r = client.post(f"/projects/{project_id}/budget/generate")
    assert r.status_code == 409
    assert "approved" in r.json()["detail"]


# --- Changing the plan --------------------------------------------------------------------


def test_changing_one_amount_rebalances_the_unlocked_channels_only(client, ai):
    project_id = with_direction(client)
    ai.use(FixedProvider(suggestion()))
    generate(client, project_id)
    plan = stage(client, project_id)["plan"]
    ig, google, email = plan["data"]["lines"]
    assert [ig["amount_cents"], google["amount_cents"], email["amount_cents"]] == [600_000, 360_000, 240_000]

    r = client.patch(f"/projects/{project_id}/budget/lines/{email['id']}", json={"locked": True})
    assert r.json()["data"]["lines"][2]["locked"] is True
    r = client.patch(f"/projects/{project_id}/budget/lines/{ig['id']}", json={"amount_cents": 700_000})
    assert r.status_code == 200, r.text
    out = r.json()
    assert amounts(out) == {"Instagram": 700_000, "Google Search": 260_000, "Email": 240_000}
    assert out["percents"][ig["id"]] == 58.3
    assert out["unsaved_changes"] is True  # autosaved, a version only when the user saves one

    r = client.patch(f"/projects/{project_id}/budget/lines/{ig['id']}", json={"amount_cents": 1_000_000})
    assert r.status_code == 422
    assert "more than the budget" in r.json()["detail"]
    assert total_of(stage(client, project_id)["plan"]) == TOTAL


def test_channels_can_be_added_renamed_and_removed_and_the_total_holds(client):
    project_id, plan = planned(client)
    r = client.post(f"/projects/{project_id}/budget/lines", json={"channel": "  Local radio ", "role": "Reach"})
    assert r.status_code == 201, r.text
    added = r.json()["data"]["lines"][-1]
    assert added["channel"] == "Local radio" and added["amount_cents"] == 0
    assert client.post(f"/projects/{project_id}/budget/lines", json={"channel": "local RADIO"}).status_code == 422

    r = client.patch(f"/projects/{project_id}/budget/lines/{added['id']}", json={"amount_cents": 200_000, "role": "Drive"})
    assert amounts(r.json())["Local radio"] == 200_000
    assert total_of(r.json()) == TOTAL

    r = client.delete(f"/projects/{project_id}/budget/lines/{added['id']}")
    assert r.status_code == 200
    assert "Local radio" not in amounts(r.json())
    assert total_of(r.json()) == TOTAL
    assert client.delete(f"/projects/{project_id}/budget/lines/nope").status_code == 404


def test_the_last_channel_cant_be_removed(client, ai):
    project_id = with_direction(client)
    ai.use(FixedProvider(suggestion(lines=[{"channel": "Email", "role": "All", "percent": 100}])))
    generate(client, project_id)
    [line] = stage(client, project_id)["plan"]["data"]["lines"]
    r = client.delete(f"/projects/{project_id}/budget/lines/{line['id']}")
    assert r.status_code == 422
    assert r.json()["detail"] == "A plan needs at least one channel."


def test_an_edit_that_breaks_the_total_is_refused_everywhere(client):
    project_id, plan = planned(client)
    lines = [{**line, "amount_cents": 1} for line in plan["data"]["lines"]]
    r = client.patch(f"/projects/{project_id}/items/{plan['id']}", json={"data": {"lines": lines}})
    assert r.status_code == 422
    assert "not the budget of $12,000" in r.json()["detail"]


def test_a_new_brief_budget_is_shown_and_fitted_keeping_locked_channels(client, ai):
    project_id = with_direction(client)
    ai.use(FixedProvider(suggestion()))
    generate(client, project_id)
    plan = stage(client, project_id)["plan"]
    email = plan["data"]["lines"][2]
    client.patch(f"/projects/{project_id}/budget/lines/{email['id']}", json={"locked": True})

    client.patch(f"/projects/{project_id}/brief", json={"budget_amount": "10000.00"})
    state = stage(client, project_id)
    assert state["total_cents"] == 1_000_000
    assert state["plan"]["total_changed"] is True

    r = client.post(f"/projects/{project_id}/budget/fit")
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["total_changed"] is False
    assert total_of(out) == 1_000_000
    assert amounts(out)["Email"] == 240_000


def test_production_costs_stay_apart_from_the_media_budget(client):
    project_id, plan = planned(client)
    production = [
        {"id": "p1", "item": "Product photos", "amount_cents": 150_000},
        {"id": "p2", "item": "Short video", "amount_cents": None},
    ]
    r = client.patch(f"/projects/{project_id}/items/{plan['id']}", json={"data": {"production": production}})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["production"] == production
    assert total_of(r.json()) == TOTAL  # the media lines don't change


def test_reset_suggestion_brings_back_the_ai_mix_but_keeps_production_costs(client):
    project_id, plan = planned(client)
    line = plan["data"]["lines"][0]
    client.patch(f"/projects/{project_id}/budget/lines/{line['id']}", json={"amount_cents": 1})
    production = [{**plan["data"]["production"][0], "amount_cents": 50_000}]
    client.patch(f"/projects/{project_id}/items/{plan['id']}", json={"data": {"production": production}})

    r = client.post(f"/projects/{project_id}/budget/reset")
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["data"]["lines"] == plan["data"]["lines"]
    assert out["data"]["production"] == production
    history = client.get(f"/projects/{project_id}/items/{plan['id']}/versions").json()
    assert [h["source"] for h in history] == ["restored", "kept_edits", "generated"]
    assert history[1]["data"]["lines"][0]["amount_cents"] == 1  # the changes before the reset are kept


def test_someone_elses_budget_is_not_found(client):
    project_id, _ = planned(client)
    client.post("/auth/logout")
    client.post("/auth/signup", json={"email": "other@example.com", "password": "good-password"})
    assert client.get(f"/projects/{project_id}/budget").status_code == 404
    assert client.post(f"/projects/{project_id}/budget/fit").status_code == 404
