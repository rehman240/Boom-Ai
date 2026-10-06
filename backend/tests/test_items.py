"""Campaign items, versions and the shared pipeline rules every stage after the brief uses."""

import uuid
from contextlib import contextmanager
from datetime import UTC, datetime

import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app import items, jobs, pipeline
from app.ai.provider import MockProvider
from app.models import (
    AiJob,
    CampaignItem,
    ItemKind,
    JobKind,
    JobStatus,
    Project,
    Revision,
    RevisionSource,
    User,
)

from tests.test_brief_summary import ready_project, signup, summarise

AI = items.Provenance(provider="mock", model="mock-1", prompt_version="test.v1")


class Card(BaseModel):
    headline: str = Field(max_length=60)
    body: str
    channels: list[str]


@pytest.fixture(autouse=True)
def card_schema(monkeypatch):
    """Stand-in for the schemas the stage modules register in later tasks."""
    for kind in ItemKind:
        monkeypatch.setitem(pipeline.ITEM_SCHEMAS, kind, lambda item: Card)


@pytest.fixture(autouse=True)
def stage_handlers(monkeypatch):
    """Stand-ins for the stage jobs the later tasks add; individual tests replace them."""
    noop = jobs.JobHandler(lambda provider, job_input: {}, lambda db, job, result, provider: None, "test.v1")
    for kind in (JobKind.AUDIENCE, JobKind.DIRECTIONS, JobKind.ASSETS, JobKind.FIELD):
        monkeypatch.setitem(jobs.HANDLERS, kind, jobs.HANDLERS.get(kind, noop))


def card(**extra):
    return {"headline": "Light that moves with you", "body": "Work anywhere.", "channels": ["Instagram"], **extra}


def project_of(db, project_id) -> Project:
    return db.get(Project, uuid.UUID(project_id))


def new_item(db, project_id, kind=ItemKind.ASSET, key="short_ad_copy", **data):
    return items.add_item(db, uuid.UUID(project_id), kind, key, card(**data), provenance=AI)


def url(project_id, item, suffix=""):
    return f"/projects/{project_id}/items/{item.id}{suffix}"


# --- Versions -----------------------------------------------------------------------------


def test_a_new_item_has_a_first_revision_with_its_provenance(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)

    [first] = client.get(url(project_id, item, "/versions")).json()
    assert first["number"] == 1
    assert first["source"] == RevisionSource.GENERATED
    assert (first["provider"], first["model"], first["prompt_version"]) == ("mock", "mock-1", "test.v1")
    assert first["project_version"] == 1
    assert first["data"] == card()

    out = client.get(url(project_id, item)).json()
    assert out["version"] == 1
    assert out["unsaved_changes"] is False


def test_every_revision_moves_the_campaign_version_on(client, db):
    project_id = ready_project(client)
    a = new_item(db, project_id, key="email")
    b = new_item(db, project_id, key="social_post")
    items.save_version(db, items.edit(db, a, {"body": "New"}))
    numbers = [r.project_version for r in db.query(Revision).filter(Revision.item_id.in_([a.id, b.id]))]
    assert sorted(numbers) == [1, 2, 3]
    assert project_of(db, project_id).version == 3


def test_editing_changes_only_the_fields_sent_and_makes_no_revision(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)

    r = client.patch(url(project_id, item), json={"data": {"body": "Edited by me."}})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["data"] == card(body="Edited by me.")
    assert out["unsaved_changes"] is True
    assert out["version"] == 1
    assert len(client.get(url(project_id, item, "/versions")).json()) == 1


def test_edits_must_keep_the_item_shape(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)

    unknown = client.patch(url(project_id, item), json={"data": {"price": "$10"}})
    assert unknown.status_code == 422
    assert "price" in unknown.json()["detail"]

    too_long = client.patch(url(project_id, item), json={"data": {"headline": "x" * 61}})
    assert too_long.status_code == 422
    assert "headline" in too_long.json()["detail"]

    wrong_type = client.patch(url(project_id, item), json={"data": {"channels": "Instagram"}})
    assert wrong_type.status_code == 422
    assert client.get(url(project_id, item)).json()["data"] == card()


def test_save_version_keeps_a_named_copy_and_does_not_repeat_itself(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    client.patch(url(project_id, item), json={"data": {"body": "Second draft."}})

    saved = client.post(url(project_id, item, "/versions"), json={"label": "  For the client  "}).json()
    assert saved["number"] == 2
    assert saved["source"] == RevisionSource.SAVED
    assert saved["label"] == "For the client"
    assert saved["data"]["body"] == "Second draft."

    again = client.post(url(project_id, item, "/versions"), json={}).json()
    assert again["number"] == 2  # nothing changed, so no duplicate revision
    assert client.get(url(project_id, item)).json()["unsaved_changes"] is False


def test_an_ai_rewrite_keeps_the_users_unsaved_edits_first(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    client.patch(url(project_id, item), json={"data": {"body": "My own words."}})

    db.refresh(item)
    items.replace_by_ai(db, item, card(body="AI words."), AI)

    history = client.get(url(project_id, item, "/versions")).json()
    assert [(r["number"], r["source"]) for r in history] == [
        (3, RevisionSource.GENERATED),
        (2, RevisionSource.KEPT_EDITS),
        (1, RevisionSource.GENERATED),
    ]
    assert history[1]["data"]["body"] == "My own words."
    assert client.get(url(project_id, item)).json()["data"]["body"] == "AI words."


def test_regenerating_one_field_leaves_every_other_field_alone(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    client.patch(url(project_id, item), json={"data": {"body": "My edit.", "channels": ["Email", "Search"]}})
    db.refresh(item)
    before = dict(item.data)

    revision = items.replace_field_by_ai(db, item, "headline", "A new headline", AI)

    assert revision.source == RevisionSource.FIELD_REGENERATED
    assert revision.field == "headline"
    assert item.data == {**before, "headline": "A new headline"}
    with pytest.raises(KeyError):
        items.replace_field_by_ai(db, item, "not_a_field", "x", AI)


def test_restoring_brings_an_old_version_back_as_a_new_one(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    client.patch(url(project_id, item), json={"data": {"body": "Version two."}})
    client.post(url(project_id, item, "/versions"), json={})
    client.patch(url(project_id, item), json={"data": {"body": "Unsaved three."}})

    r = client.post(url(project_id, item, "/versions/1/restore"))
    assert r.status_code == 200, r.text
    assert r.json()["data"] == card()
    assert r.json()["unsaved_changes"] is False

    history = client.get(url(project_id, item, "/versions")).json()
    assert [(h["number"], h["source"], h["restored_from"]) for h in history] == [
        (4, RevisionSource.RESTORED, 1),
        (3, RevisionSource.KEPT_EDITS, None),  # the unsaved edit was not lost
        (2, RevisionSource.SAVED, None),
        (1, RevisionSource.GENERATED, None),
    ]
    assert client.post(url(project_id, item, "/versions/99/restore")).status_code == 404


# --- Approval and choosing ----------------------------------------------------------------


def test_the_ai_never_changes_approved_work(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    assert client.post(url(project_id, item, "/approve")).json()["approved_at"] is not None

    db.refresh(item)
    with pytest.raises(items.ItemLocked):
        items.replace_by_ai(db, item, card(body="AI words."), AI)
    with pytest.raises(items.ItemLocked):
        items.replace_field_by_ai(db, item, "body", "AI words.", AI)
    assert item.data == card()
    assert item.version == 1


def test_a_person_editing_approved_work_asks_for_approval_again(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    client.post(url(project_id, item, "/approve"))

    out = client.patch(url(project_id, item), json={"data": {"body": "Changed."}}).json()
    assert out["approved_at"] is None

    client.post(url(project_id, item, "/approve"))
    assert client.delete(url(project_id, item, "/approve")).json()["approved_at"] is None


def test_only_one_audience_can_be_primary(client, db):
    project_id = ready_project(client)
    a = new_item(db, project_id, ItemKind.AUDIENCE, "a")
    b = new_item(db, project_id, ItemKind.AUDIENCE, "b")
    direction = new_item(db, project_id, ItemKind.DIRECTION, "1")
    client.post(url(project_id, direction, "/select"))

    client.post(url(project_id, a, "/select"))
    client.post(url(project_id, b, "/select"))
    listed = client.get(f"/projects/{project_id}/items", params={"kind": "audience"}).json()
    assert [(i["key"], i["selected"]) for i in listed] == [("a", False), ("b", True)]
    # Choosing an audience leaves the chosen direction alone.
    assert client.get(url(project_id, direction)).json()["selected"] is True

    asset = new_item(db, project_id)
    assert client.post(url(project_id, asset, "/select")).status_code == 422


def test_archived_items_are_kept_but_leave_the_live_set(client, db):
    project_id = ready_project(client)
    old = new_item(db, project_id, ItemKind.DIRECTION, "1")
    items.archive(db, old)
    new = new_item(db, project_id, ItemKind.DIRECTION, "1")  # the slot can be filled again

    listed = client.get(f"/projects/{project_id}/items", params={"kind": "direction"}).json()
    assert [i["id"] for i in listed] == [str(new.id)]
    assert client.get(url(project_id, old)).status_code == 404
    assert db.get(CampaignItem, old.id) is not None


# --- Privacy ------------------------------------------------------------------------------


def test_items_are_private_to_their_owner(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    client.post("/auth/logout")
    signup(client, "someone-else@example.com")
    other_project = client.post("/projects", json={"name": "Mine"}).json()["id"]

    assert client.get(url(project_id, item)).status_code == 404
    assert client.patch(url(project_id, item), json={"data": {"body": "x"}}).status_code == 404
    # Their own campaign id with someone else's item id is a 404 as well.
    assert client.get(url(other_project, item)).status_code == 404
    assert client.post(url(other_project, item, "/versions/1/restore")).status_code == 404


def test_the_example_campaign_is_read_only(client, db):
    project_id = ready_project(client)
    item = new_item(db, project_id)
    project_of(db, project_id).is_demo = True
    db.flush()

    assert client.get(url(project_id, item)).status_code == 200
    assert client.patch(url(project_id, item), json={"data": {"body": "x"}}).status_code == 403
    assert client.post(url(project_id, item, "/approve")).status_code == 403


# --- Duplicating and the dashboard --------------------------------------------------------


def test_duplicating_a_campaign_copies_its_work_but_not_its_approvals(client, db):
    project_id = ready_project(client)
    audience = new_item(db, project_id, ItemKind.AUDIENCE, "a")
    asset = new_item(db, project_id)
    archived = new_item(db, project_id, ItemKind.DIRECTION, "1")
    items.archive(db, archived)
    client.post(url(project_id, audience, "/select"))
    client.post(url(project_id, asset, "/approve"))
    client.patch(url(project_id, asset), json={"data": {"body": "Unsaved edit."}})

    copy_id = client.post(f"/projects/{project_id}/duplicate").json()["id"]

    copied_audience = client.get(f"/projects/{copy_id}/items", params={"kind": "audience"}).json()
    assert copied_audience[0]["selected"] is True
    [copied_asset] = client.get(f"/projects/{copy_id}/items", params={"kind": "asset"}).json()
    assert copied_asset["data"]["body"] == "Unsaved edit."
    assert copied_asset["approved_at"] is None
    assert client.get(f"/projects/{copy_id}/items", params={"kind": "direction"}).json() == []
    [first] = client.get(f"/projects/{copy_id}/items/{copied_asset['id']}/versions").json()
    assert first["source"] == RevisionSource.COPIED


def test_the_dashboard_counts_real_assets(client, db):
    project_id = ready_project(client)
    assert client.get("/projects").json()["stats"]["assets_drafted"] == 0
    new_item(db, project_id, key="email")
    new_item(db, project_id, key="social_post")
    new_item(db, project_id, ItemKind.AUDIENCE, "a")  # not an asset
    assert client.get("/projects").json()["stats"]["assets_drafted"] == 2


# --- The pipeline -------------------------------------------------------------------------


def confirm(client, project_id):
    summarise(client, project_id)
    assert client.post(f"/projects/{project_id}/brief/summary/confirm").status_code == 200


def test_each_stage_waits_for_the_one_before_it(client, db):
    project_id = ready_project(client)
    project = project_of(db, project_id)
    assert pipeline.missing_prerequisite(db, project, JobKind.AUDIENCE) == "Confirm the brief summary first."

    confirm(client, project_id)
    assert pipeline.missing_prerequisite(db, project, JobKind.AUDIENCE) is None
    assert pipeline.missing_prerequisite(db, project, JobKind.DIRECTIONS) == "Choose a primary audience first."

    items.select_item(db, new_item(db, project_id, ItemKind.AUDIENCE, "a"))
    assert pipeline.missing_prerequisite(db, project, JobKind.DIRECTIONS) is None
    assert pipeline.missing_prerequisite(db, project, JobKind.ASSETS) == "Choose a campaign direction first."

    items.select_item(db, new_item(db, project_id, ItemKind.DIRECTION, "1"))
    assert pipeline.missing_prerequisite(db, project, JobKind.ASSETS) is None

    # Editing the brief afterwards makes the summary outdated, which stops every stage.
    client.patch(f"/projects/{project_id}/brief", json={"goal": "Signups"})
    db.refresh(project)
    with pytest.raises(HTTPException) as e:
        pipeline.require_ready(db, project, JobKind.ASSETS)
    assert e.value.status_code == 409


def test_the_ai_works_from_what_the_user_confirmed_and_chose(client, db):
    project_id = ready_project(client)
    confirm(client, project_id)
    audience = new_item(db, project_id, ItemKind.AUDIENCE, "a", headline="Remote workers")
    new_item(db, project_id, ItemKind.AUDIENCE, "b", headline="Students")  # not chosen
    items.select_item(db, audience)

    ctx = pipeline.context(db, project_of(db, project_id))
    assert ctx["brief"]["business_name"] == "NOVA"
    assert ctx["summary"]["conversion_goal"]
    assert ctx["audience"]["headline"] == "Remote workers"
    assert "direction" not in ctx


# --- Jobs that write to items -------------------------------------------------------------


def direction_handler(answer_body):
    """A stand-in stage: rewrites the direction named in the job input."""

    def run(provider, job_input):
        return {"body": answer_body}

    def apply(db, job, result, provider):
        item = items.lock(db, uuid.UUID(job.input["item_id"]))
        items.replace_by_ai(
            db, item, {**item.data, **result}, items.Provenance(provider.name, provider.model, "test.v1", job.id)
        )

    return jobs.JobHandler(run, apply, "test.v1")


def start(db, project_id, kind=JobKind.DIRECTIONS, target=None, job_input=None):
    project = project_of(db, project_id)
    user = db.get(User, project.owner_id)
    background = BackgroundTasks()

    @contextmanager
    def same_session():
        yield db

    job = jobs.start_job(
        db, background, project, user, kind, job_input or {}, provider=MockProvider(),
        session_factory=lambda: same_session(), target=target,
    )
    return job, background


def test_a_job_saves_its_revision_with_the_job_and_model(client, db, monkeypatch):
    monkeypatch.setitem(jobs.HANDLERS, JobKind.DIRECTIONS, direction_handler("Fresh idea."))
    project_id = ready_project(client)
    item = new_item(db, project_id, ItemKind.DIRECTION, "2")

    job, background = start(db, project_id, target="2", job_input={"item_id": str(item.id)})
    jobs.run_job(*background.tasks[0].args)

    db.refresh(job)
    assert job.status == JobStatus.SUCCEEDED
    assert job.target == "2"
    [latest, *_] = items.history(db, item)
    assert latest.job_id == job.id
    assert latest.provider == "mock"
    assert item.data["body"] == "Fresh idea."


def test_approving_while_the_ai_writes_wins_and_says_so(client, db, monkeypatch):
    monkeypatch.setitem(jobs.HANDLERS, JobKind.DIRECTIONS, direction_handler("Late AI words."))
    project_id = ready_project(client)
    item = new_item(db, project_id, ItemKind.DIRECTION, "2")

    job, background = start(db, project_id, target="2", job_input={"item_id": str(item.id)})
    items.approve(db, item)  # the user approves before the model answers
    jobs.run_job(*background.tasks[0].args)

    job = db.get(AiJob, job.id)
    assert job.status == JobStatus.FAILED
    assert "approved" in job.error
    item = db.get(CampaignItem, item.id)
    assert item.data == card()
    assert item.approved_at is not None


def test_one_click_rejoins_and_two_jobs_never_write_to_the_same_step(client, db):
    project_id = ready_project(client)
    first, _ = start(db, project_id, target="1")
    again, _ = start(db, project_id, target="1")
    assert again.id == first.id

    with pytest.raises(HTTPException) as other_direction:
        start(db, project_id, target="2")
    assert other_direction.value.status_code == 409
    with pytest.raises(HTTPException) as whole_step:
        start(db, project_id)
    assert whole_step.value.status_code == 409

    # A different step is free to run.
    audience, _ = start(db, project_id, kind=JobKind.AUDIENCE)
    assert audience.kind == JobKind.AUDIENCE


def test_a_field_regeneration_waits_for_a_whole_assets_run(client, db):
    project_id = ready_project(client)
    start(db, project_id, kind=JobKind.ASSETS)
    with pytest.raises(HTTPException) as e:
        start(db, project_id, kind=JobKind.FIELD, target="some-item:headline")
    assert e.value.status_code == 409


def test_a_stale_job_does_not_block_the_step(client, db):
    project_id = ready_project(client)
    stuck = AiJob(project_id=uuid.UUID(project_id), kind=JobKind.DIRECTIONS, target="1", status=JobStatus.RUNNING,
                  started_at=datetime(2026, 1, 1, tzinfo=UTC))
    db.add(stuck)
    db.flush()
    job, _ = start(db, project_id, target="2")
    assert job.id != stuck.id
    assert db.get(AiJob, stuck.id).status == JobStatus.FAILED
