"""Creative Workspace: seven assets, whole generation and single-field rewrites (client brief 4.6)."""

import uuid
from contextlib import contextmanager

from app import creative
from app.ai import assets
from app.ai.provider import MockProvider
from app.jobs import run_job
from app.models import AiJob, JobKind, JobStatus, Project

from tests.test_audiences import RecordingProvider
from tests.test_brief_summary import FailingProvider, FixedProvider, signup
from tests.test_directions import generate as generate_directions
from tests.test_directions import stage as direction_stage
from tests.test_directions import with_audience

ASSET_KEYS = [a.key for a in assets.ASSETS]


def with_direction(client):
    """A campaign with a confirmed brief, a primary audience and a chosen direction."""
    project_id = with_audience(client)
    generate_directions(client, project_id)
    chosen = direction_stage(client, project_id)["directions"][0]
    client.post(f"/projects/{project_id}/items/{chosen['id']}/select")
    return project_id


def stage(client, project_id):
    r = client.get(f"/projects/{project_id}/assets")
    assert r.status_code == 200, r.text
    return r.json()


def generate(client, project_id):
    r = client.post(f"/projects/{project_id}/assets/generate")
    assert r.status_code == 202, r.text
    return r.json()


def rewrite(client, project_id, item_id, field):
    r = client.post(f"/projects/{project_id}/assets/{item_id}/fields/{field}/regenerate")
    assert r.status_code == 202, r.text
    return r.json()


def by_key(state):
    return {a["key"]: a for a in state["assets"]}


def full_answer(**overrides):
    answer = {a.key: {f.key: f"{a.label} {f.label}" for f in a.fields} for a in assets.ASSETS}
    for key, fields in overrides.items():
        answer[key] = {**answer[key], **fields}
    return answer


# --- The definitions ----------------------------------------------------------------------


def test_the_seven_assets_of_the_client_brief_are_defined_with_guidance():
    assert ASSET_KEYS == [
        "overview", "landing_page", "short_ad", "long_ad", "email", "social_post", "visual_brief",
    ]
    for a in assets.ASSETS:
        for f in a.fields:
            assert 0 < f.guidance <= f.limit
    item = assets.SCHEMA["properties"]["email"]
    assert item["additionalProperties"] is False
    assert set(item["required"]) == {"subject", "preview_text", "body", "call_to_action"}
    assert "About 50 characters" in item["properties"]["subject"]["description"]


def test_the_screen_gets_the_definitions(client):
    project_id = with_direction(client)
    spec = stage(client, project_id)["spec"]
    assert [s["key"] for s in spec] == ASSET_KEYS
    short = next(s for s in spec if s["key"] == "short_ad")
    primary = next(f for f in short["fields"] if f["key"] == "primary_text")
    assert (primary["guidance"], primary["limit"], primary["multiline"]) == (125, 300, True)


# --- Generating ---------------------------------------------------------------------------


def test_assets_wait_for_a_chosen_direction(client):
    project_id = with_audience(client)
    assert stage(client, project_id)["blocked_reason"] == "Choose a campaign direction first."
    assert client.post(f"/projects/{project_id}/assets/generate").status_code == 409


def test_generating_writes_all_seven_assets_from_the_chosen_direction(client, ai):
    project_id = with_direction(client)
    chosen = next(d for d in direction_stage(client, project_id)["directions"] if d["selected"])
    recorder = RecordingProvider()
    ai.use(recorder)
    job = generate(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.SUCCEEDED

    task = recorder.tasks[-1]
    assert task.facts["context"]["direction"]["name"] == chosen["data"]["name"]
    assert "Never invent prices" in task.system
    assert "Do not claim any image exists" in task.system

    state = stage(client, project_id)
    assert [a["key"] for a in state["assets"]] == ASSET_KEYS
    for a in state["assets"]:
        spec = assets.BY_KEY[a["key"]]
        assert set(a["data"]) == {f.key for f in spec.fields}
        assert a["outdated"] is False
    [first] = client.get(f"/projects/{project_id}/items/{state['assets'][0]['id']}/versions").json()
    assert first["prompt_version"] == assets.PROMPT_VERSION
    assert client.get("/projects").json()["stats"]["assets_drafted"] == 7


def test_generating_again_keeps_edited_saved_and_approved_assets(client):
    project_id = with_direction(client)
    generate(client, project_id)
    before = by_key(stage(client, project_id))
    client.patch(f"/projects/{project_id}/items/{before['email']['id']}", json={"data": {"subject": "My subject"}})
    client.post(f"/projects/{project_id}/items/{before['short_ad']['id']}/approve")
    # A different direction, so the AI would write different text.
    other = next(d for d in direction_stage(client, project_id)["directions"] if not d["selected"])
    client.post(f"/projects/{project_id}/items/{other['id']}/select")

    generate(client, project_id)

    after = by_key(stage(client, project_id))
    assert after["email"]["data"]["subject"] == "My subject"
    assert after["short_ad"]["data"] == before["short_ad"]["data"]
    assert after["overview"]["data"]["promise"] == other["data"]["promise"]
    assert after["overview"]["id"] == before["overview"]["id"]  # same asset, longer history
    assert len(client.get(f"/projects/{project_id}/items/{after['overview']['id']}/versions").json()) == 2


def test_generating_again_is_refused_when_every_asset_is_kept(client):
    project_id = with_direction(client)
    generate(client, project_id)
    for a in stage(client, project_id)["assets"]:
        client.post(f"/projects/{project_id}/items/{a['id']}/approve")
    r = client.post(f"/projects/{project_id}/assets/generate")
    assert r.status_code == 409
    assert "single fields" in r.json()["detail"]


def test_a_failed_generation_keeps_every_asset(client, ai):
    project_id = with_direction(client)
    generate(client, project_id)
    before = stage(client, project_id)["assets"]
    ai.use(FailingProvider())
    job = generate(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.FAILED
    assert stage(client, project_id)["assets"] == before


def test_a_malformed_or_too_long_answer_fails_plainly(client, ai):
    project_id = with_direction(client)
    ai.use(FixedProvider(full_answer(short_ad={"headline": "x" * 61})))
    job = generate(client, project_id)
    polled = client.get(f"/projects/{project_id}/jobs/{job['id']}").json()
    assert polled["status"] == JobStatus.FAILED
    assert polled["error"] == "The AI answer was not in the expected format."
    assert stage(client, project_id)["assets"] == []


# --- Rewriting one field ------------------------------------------------------------------


def test_rewriting_one_field_changes_nothing_else(client, ai):
    project_id = with_direction(client)
    generate(client, project_id)
    before = by_key(stage(client, project_id))
    email = before["email"]
    client.patch(f"/projects/{project_id}/items/{email['id']}", json={"data": {"body": "My own body text."}})

    recorder = RecordingProvider()
    ai.use(recorder)
    job = rewrite(client, project_id, email["id"], "subject")
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.SUCCEEDED
    task = recorder.tasks[-1]
    assert task.name == assets.FIELD_TASK_NAME
    assert task.facts["current"]["body"] == "My own body text."  # the model sees the asset as it is
    assert '"Subject line"' in task.prompt

    after = by_key(stage(client, project_id))
    assert after["email"]["data"]["subject"] != email["data"]["subject"]
    assert {k: v for k, v in after["email"]["data"].items() if k != "subject"} == {
        **{k: v for k, v in email["data"].items() if k != "subject"}, "body": "My own body text.",
    }
    for key in ASSET_KEYS:
        if key != "email":
            assert after[key] == before[key]

    history = client.get(f"/projects/{project_id}/items/{email['id']}/versions").json()
    assert [(h["source"], h["field"]) for h in history] == [
        ("field_regenerated", "subject"), ("kept_edits", None), ("generated", None),
    ]
    assert history[0]["prompt_version"] == assets.FIELD_PROMPT_VERSION
    assert stage(client, project_id)["field_jobs"][f"{email['id']}:subject"]["id"] == job["id"]


def test_a_rewritten_field_must_fit_its_limit(client, ai):
    project_id = with_direction(client)
    generate(client, project_id)
    short = by_key(stage(client, project_id))["short_ad"]
    ai.use(FixedProvider({"value": "x" * 61}))
    job = rewrite(client, project_id, short["id"], "headline")
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.FAILED
    ai.use(FixedProvider({"value": "   "}))
    job = rewrite(client, project_id, short["id"], "headline")
    assert "empty" in client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["error"]
    assert by_key(stage(client, project_id))["short_ad"]["data"] == short["data"]


def test_two_fields_can_be_rewritten_at_once_but_not_during_a_whole_run(client, db):
    project_id = with_direction(client)
    generate(client, project_id)
    email = by_key(stage(client, project_id))["email"]
    db.add(AiJob(project_id=uuid.UUID(project_id), kind=JobKind.FIELD, target=f"{email['id']}:subject",
                 status=JobStatus.RUNNING))
    db.flush()
    assert client.post(f"/projects/{project_id}/assets/{email['id']}/fields/body/regenerate").status_code == 202
    assert client.post(f"/projects/{project_id}/assets/generate").status_code == 409


def test_an_approved_asset_is_never_rewritten(client, db):
    project_id = with_direction(client)
    generate(client, project_id)
    short = by_key(stage(client, project_id))["short_ad"]
    client.post(f"/projects/{project_id}/items/{short['id']}/approve")
    r = client.post(f"/projects/{project_id}/assets/{short['id']}/fields/headline/regenerate")
    assert r.status_code == 409
    assert "approved" in r.json()["detail"]


def test_approving_while_a_field_is_rewritten_wins(client, db):
    project_id = with_direction(client)
    generate(client, project_id)
    short = by_key(stage(client, project_id))["short_ad"]
    project = db.get(Project, uuid.UUID(project_id))
    item = db.get(creative.CampaignItem, uuid.UUID(short["id"]))
    job = AiJob(project_id=project.id, kind=JobKind.FIELD, target=creative.field_target(item, "headline"),
                status=JobStatus.QUEUED, input=creative.field_input(db, project, item, "headline"))
    db.add(job)
    db.flush()
    client.post(f"/projects/{project_id}/items/{short['id']}/approve")

    @contextmanager
    def same():
        yield db

    run_job(job.id, lambda: same(), MockProvider())
    db.refresh(job)
    assert job.status == JobStatus.FAILED
    assert "approved" in job.error
    assert by_key(stage(client, project_id))["short_ad"]["data"] == short["data"]


def test_unknown_assets_and_fields_are_not_found(client):
    project_id = with_direction(client)
    generate(client, project_id)
    email = by_key(stage(client, project_id))["email"]
    direction = direction_stage(client, project_id)["directions"][0]
    assert client.post(f"/projects/{project_id}/assets/{email['id']}/fields/price/regenerate").status_code == 404
    assert client.post(f"/projects/{project_id}/assets/{direction['id']}/fields/name/regenerate").status_code == 404
    assert client.post(f"/projects/{project_id}/assets/{uuid.uuid4()}/fields/subject/regenerate").status_code == 404


# --- Editing, outdated, flags, privacy -----------------------------------------------------


def test_edits_keep_each_assets_own_shape_and_limits(client):
    project_id = with_direction(client)
    generate(client, project_id)
    short = by_key(stage(client, project_id))["short_ad"]
    url = f"/projects/{project_id}/items/{short['id']}"
    assert client.patch(url, json={"data": {"subject": "Email field"}}).status_code == 422
    assert client.patch(url, json={"data": {"headline": "x" * 61}}).status_code == 422
    assert client.patch(url, json={"data": {"headline": "x" * 60}}).status_code == 200


def test_assets_say_when_the_direction_they_came_from_changed(client):
    project_id = with_direction(client)
    generate(client, project_id)
    assert not any(a["outdated"] for a in stage(client, project_id)["assets"])
    chosen = next(d for d in direction_stage(client, project_id)["directions"] if d["selected"])
    client.patch(f"/projects/{project_id}/items/{chosen['id']}", json={"data": {"headline": "New direction headline"}})
    assert all(a["outdated"] for a in stage(client, project_id)["assets"])


def test_invented_figures_and_risky_claims_in_assets_are_flagged(client, ai):
    project_id = with_direction(client)
    ai.use(FixedProvider(full_answer(
        short_ad={"headline": "Guaranteed focus"},
        email={"body": "Join 10,000 happy customers."},
    )))
    generate(client, project_id)
    state = by_key(stage(client, project_id))
    assert [f["category"] for f in state["short_ad"]["review_flags"]] == ["performance"]
    assert [f["category"] for f in state["email"]["review_flags"]] == ["other"]
    assert state["overview"]["review_flags"] == []


def test_assets_are_private_and_copied_with_the_campaign(client):
    project_id = with_direction(client)
    generate(client, project_id)
    copy_id = client.post(f"/projects/{project_id}/duplicate").json()["id"]
    assert [a["key"] for a in stage(client, copy_id)["assets"]] == ASSET_KEYS
    email = by_key(stage(client, project_id))["email"]

    client.post("/auth/logout")
    signup(client, "other@example.com")
    assert client.get(f"/projects/{project_id}/assets").status_code == 404
    mine = client.post("/projects", json={"name": "Mine"}).json()["id"]
    assert client.post(f"/projects/{mine}/assets/{email['id']}/fields/subject/regenerate").status_code == 404


def test_outline_numbers_and_image_sizes_are_not_called_invented_figures(client, ai):
    project_id = with_direction(client)
    ai.use(FixedProvider(full_answer(
        landing_page={"sections": "1. The problem\n2. The product\n3) How to get it"},
        visual_brief={"formats": "1080x1080 feed, 1080 x 1920 story, 1200x628px link ad"},
    )))
    generate(client, project_id)
    state = by_key(stage(client, project_id))
    assert state["landing_page"]["review_flags"] == []
    assert state["visual_brief"]["review_flags"] == []
