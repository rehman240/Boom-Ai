"""Generate Campaign: three directions, regenerated together or one at a time (client brief 4.5)."""

import uuid
from contextlib import contextmanager

from app import directions as stage_logic
from app.ai import directions
from app.ai.provider import MockProvider
from app.jobs import run_job
from app.models import AiJob, JobKind, JobStatus, Project, ProjectStage

from tests.test_audiences import RecordingProvider, confirmed_project
from tests.test_audiences import generate as generate_audiences
from tests.test_audiences import stage as audience_stage
from tests.test_brief_summary import FailingProvider, FixedProvider, signup

FIELDS = {
    "name", "promise", "headline", "key_message", "concept", "channels", "channel_fit",
    "risks", "rationale", "based_on", "assumptions",
}


def with_audience(client):
    """A campaign with a confirmed brief and a chosen primary audience."""
    project_id = confirmed_project(client, channels=["Instagram", "Email"])
    generate_audiences(client, project_id)
    card = audience_stage(client, project_id)["cards"][0]
    client.post(f"/projects/{project_id}/items/{card['id']}/select")
    return project_id


def stage(client, project_id):
    r = client.get(f"/projects/{project_id}/directions")
    assert r.status_code == 200, r.text
    return r.json()


def generate(client, project_id):
    r = client.post(f"/projects/{project_id}/directions/generate")
    assert r.status_code == 202, r.text
    return r.json()


def regenerate(client, project_id, slot):
    r = client.post(f"/projects/{project_id}/directions/{slot}/regenerate")
    assert r.status_code == 202, r.text
    return r.json()


def direction(**extra):
    return {
        "name": "Light that travels", "promise": "Good light wherever you work.",
        "headline": "Your desk is wherever you are.", "key_message": "One lamp for every place you work.",
        "concept": "A day in three places, the lamp in each.", "channels": ["Instagram"],
        "channel_fit": "Visual channels show the lamp in use.", "risks": ["Needs strong photos."],
        "rationale": "Hybrid workers move between places.",
        "based_on": [{"source": "description", "detail": "more than one place"}], "assumptions": [],
        **extra,
    }


def by_slot(state):
    return {d["slot"]: d for d in state["directions"]}


# --- Generating ---------------------------------------------------------------------------


def test_directions_wait_for_a_primary_audience(client):
    project_id = confirmed_project(client)
    assert stage(client, project_id)["blocked_reason"] == "Choose a primary audience first."
    assert client.post(f"/projects/{project_id}/directions/generate").status_code == 409
    assert client.post(f"/projects/{project_id}/directions/1/regenerate").status_code == 409


def test_generating_makes_three_distinct_full_directions(client):
    project_id = with_audience(client)
    job = generate(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.SUCCEEDED

    state = stage(client, project_id)
    assert state["job"]["id"] == job["id"]
    assert [d["slot"] for d in state["directions"]] == ["1", "2", "3"]
    assert len({d["data"]["name"] for d in state["directions"]}) == 3
    for d in state["directions"]:
        assert set(d["data"]) == FIELDS
        assert d["outdated"] is False
        assert d["review_flags"] == []
        assert set(d["data"]["channels"]) <= {"Instagram", "Email"}
    [first] = client.get(f"/projects/{project_id}/items/{state['directions'][0]['id']}/versions").json()
    assert first["prompt_version"] == directions.PROMPT_VERSION


def test_the_ai_is_told_the_audience_the_rules_and_what_to_differ_from(client, ai):
    project_id = with_audience(client)
    generate(client, project_id)
    chosen_audience = next(c for c in audience_stage(client, project_id)["cards"] if c["selected"])
    recorder = RecordingProvider()
    ai.use(recorder)
    before = by_slot(stage(client, project_id))
    regenerate(client, project_id, "2")

    task = recorder.tasks[-1]
    assert task.name == "directions"
    assert "substantively different" in task.system
    assert "Never invent prices" in task.system
    assert task.facts["context"]["audience"]["name"] == chosen_audience["data"]["name"]
    assert [r["name"] for r in task.facts["replace"]] == [before["2"]["data"]["name"]]
    assert {k["name"] for k in task.facts["keep"]} == {before["1"]["data"]["name"], before["3"]["data"]["name"]}
    assert "direction" not in task.facts["context"]


# --- Regenerating one ---------------------------------------------------------------------


def test_regenerating_one_direction_leaves_the_others_untouched(client):
    project_id = with_audience(client)
    generate(client, project_id)
    before = by_slot(stage(client, project_id))

    job = regenerate(client, project_id, "2")
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.SUCCEEDED

    after = by_slot(stage(client, project_id))
    assert after["1"] == before["1"]
    assert after["3"] == before["3"]
    assert after["2"]["id"] == before["2"]["id"]  # same slot, same history
    assert after["2"]["data"]["name"] not in {before[s]["data"]["name"] for s in "123"}
    assert stage(client, project_id)["slot_jobs"]["2"]["id"] == job["id"]

    # The old direction is in the slot's history and can be brought back.
    history = client.get(f"/projects/{project_id}/items/{after['2']['id']}/versions").json()
    assert [h["number"] for h in history] == [2, 1]
    restored = client.post(f"/projects/{project_id}/items/{after['2']['id']}/versions/1/restore").json()
    assert restored["data"] == before["2"]["data"]


def test_a_chosen_direction_can_be_regenerated_on_purpose_and_its_old_text_is_kept(client):
    project_id = with_audience(client)
    generate(client, project_id)
    chosen = by_slot(stage(client, project_id))["1"]
    client.post(f"/projects/{project_id}/items/{chosen['id']}/select")
    client.patch(f"/projects/{project_id}/items/{chosen['id']}", json={"data": {"headline": "My own headline."}})

    regenerate(client, project_id, "1")

    history = client.get(f"/projects/{project_id}/items/{chosen['id']}/versions").json()
    assert [h["source"] for h in history] == ["generated", "kept_edits", "generated"]
    assert history[1]["data"]["headline"] == "My own headline."


def test_an_approved_direction_is_never_replaced(client, db):
    project_id = with_audience(client)
    generate(client, project_id)
    approved = by_slot(stage(client, project_id))["3"]
    client.post(f"/projects/{project_id}/items/{approved['id']}/approve")

    r = client.post(f"/projects/{project_id}/directions/3/regenerate")
    assert r.status_code == 409
    assert "approved" in r.json()["detail"]
    assert by_slot(stage(client, project_id))["3"]["data"] == approved["data"]


def test_approving_while_the_ai_writes_keeps_the_approved_direction(client, db):
    project_id = with_audience(client)
    generate(client, project_id)
    target = by_slot(stage(client, project_id))["2"]
    # Start the job without letting it run yet, approve, then let it finish.
    job_input = stage_logic.slot_input(db, db.get(Project, uuid.UUID(project_id)), "2")
    job = AiJob(project_id=uuid.UUID(project_id), kind=JobKind.DIRECTIONS, target="2", status=JobStatus.QUEUED,
                input=job_input)
    db.add(job)
    db.flush()
    client.post(f"/projects/{project_id}/items/{target['id']}/approve")

    @contextmanager
    def same():
        yield db

    run_job(job.id, lambda: same(), MockProvider())
    db.refresh(job)
    assert job.status == JobStatus.FAILED
    assert "approved" in job.error
    assert by_slot(stage(client, project_id))["2"]["data"] == target["data"]


def test_unknown_slots_are_not_found(client):
    project_id = with_audience(client)
    assert client.post(f"/projects/{project_id}/directions/4/regenerate").status_code == 404
    assert client.post(f"/projects/{project_id}/directions/0/regenerate").status_code == 404


def test_two_directions_can_be_regenerated_at_once_but_not_with_all_three(client, db):
    project_id = with_audience(client)
    generate(client, project_id)
    for slot in ("1", "2"):
        db.add(AiJob(project_id=uuid.UUID(project_id), kind=JobKind.DIRECTIONS, target=slot, status=JobStatus.RUNNING))
    db.flush()
    assert client.post(f"/projects/{project_id}/directions/3/regenerate").status_code == 202
    assert client.post(f"/projects/{project_id}/directions/generate").status_code == 409


# --- Generating all again -----------------------------------------------------------------


def test_generating_again_keeps_chosen_and_edited_directions(client):
    project_id = with_audience(client)
    generate(client, project_id)
    before = by_slot(stage(client, project_id))
    client.post(f"/projects/{project_id}/items/{before['1']['id']}/select")
    client.patch(f"/projects/{project_id}/items/{before['3']['id']}", json={"data": {"promise": "My promise."}})

    generate(client, project_id)

    after = by_slot(stage(client, project_id))
    assert after["1"]["data"] == before["1"]["data"]
    assert after["3"]["data"]["promise"] == "My promise."
    assert after["2"]["data"]["name"] != before["2"]["data"]["name"]


def test_generating_again_is_refused_when_every_direction_is_kept(client):
    project_id = with_audience(client)
    generate(client, project_id)
    for d in stage(client, project_id)["directions"]:
        client.patch(f"/projects/{project_id}/items/{d['id']}", json={"data": {"headline": "Mine."}})
    r = client.post(f"/projects/{project_id}/directions/generate")
    assert r.status_code == 409
    assert "one direction at a time" in r.json()["detail"]


def test_a_failed_generation_keeps_every_direction(client, ai):
    project_id = with_audience(client)
    generate(client, project_id)
    before = stage(client, project_id)["directions"]

    ai.use(FailingProvider())
    job = regenerate(client, project_id, "2")
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.FAILED
    assert stage(client, project_id)["directions"] == before

    ai.use(FixedProvider({"directions": [direction()]}))  # one is too few for all three
    client.post(f"/projects/{project_id}/items/{before[0]['id']}/approve")  # so only two slots are open
    job = generate(client, project_id)
    polled = client.get(f"/projects/{project_id}/jobs/{job['id']}").json()
    assert polled["status"] == JobStatus.FAILED
    assert "too few" in polled["error"]
    assert [d["data"] for d in stage(client, project_id)["directions"]] == [d["data"] for d in before]


# --- Choosing, outdated, flags ------------------------------------------------------------


def test_choosing_a_direction_opens_the_creative_workspace(client):
    project_id = with_audience(client)
    generate(client, project_id)
    a, b, _ = stage(client, project_id)["directions"]
    client.post(f"/projects/{project_id}/items/{a['id']}/select")
    client.post(f"/projects/{project_id}/items/{b['id']}/select")
    assert [d["selected"] for d in stage(client, project_id)["directions"]] == [False, True, False]
    assert client.get(f"/projects/{project_id}").json()["stage"] == ProjectStage.CREATIVE


def test_directions_say_when_the_audience_they_were_made_for_changed(client):
    project_id = with_audience(client)
    generate(client, project_id)
    assert not any(d["outdated"] for d in stage(client, project_id)["directions"])

    other = next(c for c in audience_stage(client, project_id)["cards"] if not c["selected"])
    client.post(f"/projects/{project_id}/items/{other['id']}/select")
    assert all(d["outdated"] for d in stage(client, project_id)["directions"])

    regenerate(client, project_id, "1")
    assert [d["outdated"] for d in stage(client, project_id)["directions"]] == [False, True, True]

    # Choosing a direction is not an input to the directions, so it doesn't outdate them.
    first = stage(client, project_id)["directions"][0]
    client.post(f"/projects/{project_id}/items/{first['id']}/select")
    assert stage(client, project_id)["directions"][0]["outdated"] is False


def test_invented_figures_and_risky_claims_are_flagged(client, ai):
    project_id = with_audience(client)
    ai.use(FixedProvider({"directions": [
        direction(name="A", headline="Rated #1 by 5,000 users."),
        direction(name="B", promise="Guaranteed better focus."),
        direction(name="C", rationale="The fastest way to recognition. 70% of travellers agree."),
    ]}))
    generate(client, project_id)
    a, b, c = stage(client, project_id)["directions"]
    assert {f["category"] for f in a["review_flags"]} == {"performance", "other"}
    assert "5000" in next(f["claim"] for f in a["review_flags"] if f["category"] == "other")
    assert [f["category"] for f in b["review_flags"]] == ["performance"]
    # Reasoning isn't a claim to the audience, but an invented figure anywhere is flagged.
    assert [f["category"] for f in c["review_flags"]] == ["other"]
    assert "70" in c["review_flags"][0]["claim"]


def test_edits_keep_the_direction_shape(client):
    project_id = with_audience(client)
    generate(client, project_id)
    d = stage(client, project_id)["directions"][0]
    url = f"/projects/{project_id}/items/{d['id']}"
    assert client.patch(url, json={"data": {"risks": ["a", "b", "c", "d", "e"]}}).status_code == 422
    assert client.patch(url, json={"data": {"promise": ""}}).status_code == 422
    assert client.patch(url, json={"data": {"headline": "x" * 121}}).status_code == 422
    assert client.patch(url, json={"data": {"headline": "Better light, anywhere."}}).status_code == 200


def test_directions_are_private_and_copied_with_the_campaign(client, db):
    project_id = with_audience(client)
    generate(client, project_id)
    copy_id = client.post(f"/projects/{project_id}/duplicate").json()["id"]
    assert len(stage(client, copy_id)["directions"]) == 3

    client.post("/auth/logout")
    signup(client, "other@example.com")
    assert client.get(f"/projects/{project_id}/directions").status_code == 404
    assert client.post(f"/projects/{project_id}/directions/1/regenerate").status_code == 404


def test_the_schema_sent_to_providers_is_strict():
    item = directions.SCHEMA["properties"]["directions"]["items"]
    assert item["additionalProperties"] is False
    assert set(item["required"]) == FIELDS
