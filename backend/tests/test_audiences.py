"""Identify Target: audience hypotheses (client brief 4.4)."""

import uuid

from app.ai import audience
from app.ai.provider import MockProvider
from app.models import CampaignItem, JobStatus, Project, ProjectStage

from tests.test_brief_summary import FailingProvider, FixedProvider, ready_project, signup, summarise

FIELDS = {"name", "definition", "need", "motivation", "objection", "message_angle", "channels", "based_on", "assumptions"}


def confirmed_project(client, **extra):
    project_id = ready_project(client, **extra)
    summarise(client, project_id)
    assert client.post(f"/projects/{project_id}/brief/summary/confirm").status_code == 200
    return project_id


def stage(client, project_id):
    r = client.get(f"/projects/{project_id}/audiences")
    assert r.status_code == 200, r.text
    return r.json()


def generate(client, project_id):
    r = client.post(f"/projects/{project_id}/audiences/generate")
    assert r.status_code == 202, r.text
    return r.json()


def ai_card(**extra):
    return {
        "name": "Hybrid workers",
        "definition": "People who split the week between home and an office.",
        "need": "Good light wherever they sit.",
        "motivation": "They are tired of carrying cables.",
        "objection": "They already own a desk lamp.",
        "message_angle": "One lamp for every desk.",
        "channels": ["Instagram"],
        "based_on": [{"source": "description", "detail": "works in more than one place"}],
        "assumptions": ["They move between places at least weekly."],
        **extra,
    }


class RecordingProvider(MockProvider):
    """The mock, but it keeps the tasks it was given."""

    def __init__(self):
        super().__init__()
        self.tasks = []

    def generate(self, task):
        self.tasks.append(task)
        return super().generate(task)


# --- Generating ---------------------------------------------------------------------------


def test_audiences_wait_for_a_confirmed_summary(client):
    project_id = ready_project(client)
    assert stage(client, project_id)["blocked_reason"] == "Confirm the brief summary first."
    r = client.post(f"/projects/{project_id}/audiences/generate")
    assert r.status_code == 409
    assert r.json()["detail"] == "Confirm the brief summary first."

    summarise(client, project_id)
    client.post(f"/projects/{project_id}/brief/summary/confirm")
    assert stage(client, project_id)["blocked_reason"] is None

    # Editing the brief afterwards outdates the summary and blocks the stage again.
    client.patch(f"/projects/{project_id}/brief", json={"goal": "Signups"})
    assert client.post(f"/projects/{project_id}/audiences/generate").status_code == 409


def test_generating_makes_two_to_four_full_cards_with_their_provenance(client):
    project_id = confirmed_project(client, channels=["Instagram", "Email"])
    job = generate(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.SUCCEEDED

    state = stage(client, project_id)
    assert state["job"]["id"] == job["id"]
    cards = state["cards"]
    assert 2 <= len(cards) <= 4
    for card in cards:
        assert set(card["data"]) == FIELDS
        assert card["origin"] == "ai"
        assert card["data"]["based_on"], "every card says what it is based on"
        assert set(card["data"]["channels"]) <= {"Instagram", "Email"}
        assert card["review_flags"] == []
    [first] = client.get(f"/projects/{project_id}/items/{cards[0]['id']}/versions").json()
    assert first["prompt_version"] == audience.PROMPT_VERSION
    assert first["provider"] == "mock"


def test_generating_again_keeps_what_the_user_chose_wrote_or_edited(client):
    project_id = confirmed_project(client)
    generate(client, project_id)
    chosen, edited, untouched, *_ = stage(client, project_id)["cards"]
    client.post(f"/projects/{project_id}/items/{chosen['id']}/select")
    client.patch(f"/projects/{project_id}/items/{edited['id']}", json={"data": {"need": "My wording."}})
    own = client.post(f"/projects/{project_id}/audiences", json={"name": "My regulars", "definition": "People who already buy from us."}).json()

    generate(client, project_id)

    cards = stage(client, project_id)["cards"]
    ids = [c["id"] for c in cards]
    assert ids[:3] == [chosen["id"], edited["id"], own["id"]]  # kept, in their places, first
    assert untouched["id"] not in ids
    assert len(cards) == 3 + audience.new_card_count(3)
    kept_names = {chosen["data"]["name"], edited["data"]["name"], "My regulars"}
    assert not kept_names & {c["data"]["name"] for c in cards[3:]}, "new cards differ from kept ones"
    # The replaced card is archived with its history, not deleted.
    assert client.get(f"/projects/{project_id}/items/{untouched['id']}").status_code == 404


def test_the_ai_is_told_the_rules_the_exclusions_and_the_cards_that_stay(client, ai):
    recorder = RecordingProvider()
    ai.use(recorder)
    project_id = confirmed_project(client)
    client.put(f"/projects/{project_id}/audiences/exclusions", json={"exclusions": ["Students"]})
    client.post(f"/projects/{project_id}/audiences", json={"name": "My regulars", "definition": "Existing buyers."})
    generate(client, project_id)

    task = recorder.tasks[-1]
    assert task.name == "audience"
    assert "protected or sensitive" in task.system
    assert "Never invent prices" in task.system
    assert "Students" in task.prompt
    assert "My regulars" in task.prompt
    assert "NOVA" in task.prompt
    assert task.facts["count"] == 3
    assert task.facts["context"]["summary"]["conversion_goal"]


def test_a_failed_generation_leaves_the_cards_as_they_were(client, ai):
    project_id = confirmed_project(client)
    generate(client, project_id)
    before = stage(client, project_id)["cards"]

    ai.use(FailingProvider())
    job = generate(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.FAILED
    assert stage(client, project_id)["cards"] == before

    ai.use(FixedProvider({"audiences": [ai_card()]}))  # one card is too few
    job = generate(client, project_id)
    polled = client.get(f"/projects/{project_id}/jobs/{job['id']}").json()
    assert polled["status"] == JobStatus.FAILED
    assert "too few" in polled["error"]
    assert stage(client, project_id)["cards"] == before


def test_extra_cards_from_the_model_are_trimmed(client, ai):
    project_id = confirmed_project(client)
    ai.use(FixedProvider({"audiences": [ai_card(name=f"Audience {n}") for n in "ABCD"]}))
    client.post(f"/projects/{project_id}/audiences", json={"name": "Mine", "definition": "Mine."})
    client.post(f"/projects/{project_id}/audiences", json={"name": "Also mine", "definition": "Mine too."})
    generate(client, project_id)
    assert len(stage(client, project_id)["cards"]) == 2 + 2


# --- Choosing, writing, removing ----------------------------------------------------------


def test_choosing_a_primary_audience_opens_generate_campaign(client, db):
    project_id = confirmed_project(client)
    generate(client, project_id)
    a, b, *_ = stage(client, project_id)["cards"]
    client.post(f"/projects/{project_id}/items/{a['id']}/select")
    client.post(f"/projects/{project_id}/items/{b['id']}/select")

    assert [c["selected"] for c in stage(client, project_id)["cards"]][:2] == [False, True]
    assert client.get(f"/projects/{project_id}").json()["stage"] == ProjectStage.CAMPAIGN


def test_the_stage_never_moves_back(client, db):
    project_id = confirmed_project(client)
    db.get(Project, uuid.UUID(project_id)).stage = ProjectStage.CREATIVE
    db.flush()
    generate(client, project_id)
    card = stage(client, project_id)["cards"][0]
    client.post(f"/projects/{project_id}/items/{card['id']}/select")
    assert client.get(f"/projects/{project_id}").json()["stage"] == ProjectStage.CREATIVE


def test_the_user_can_write_their_own_audience(client):
    project_id = confirmed_project(client)
    r = client.post(f"/projects/{project_id}/audiences", json={
        "name": "  Design students  ",
        "definition": "Students who need a lamp for late study.",
        "channels": ["TikTok"],
    })
    assert r.status_code == 201, r.text
    own = r.json()
    assert own["origin"] == "user"
    assert own["data"]["need"] == ""
    assert own["data"]["assumptions"] == []
    [first] = client.get(f"/projects/{project_id}/items/{own['id']}/versions").json()
    assert first["source"] == "created"
    assert first["provider"] is None

    assert client.post(f"/projects/{project_id}/audiences", json={"name": "", "definition": "x"}).status_code == 422
    assert client.post(f"/projects/{project_id}/audiences", json={"name": "x", "definition": "x", "channels": ["Myspace"]}).status_code == 422


def test_cards_are_edited_through_the_shared_routes_and_keep_their_shape(client):
    project_id = confirmed_project(client)
    generate(client, project_id)
    card = stage(client, project_id)["cards"][0]
    url = f"/projects/{project_id}/items/{card['id']}"

    ok = client.patch(url, json={"data": {"channels": ["LinkedIn"], "objection": "Price."}})
    assert ok.status_code == 200, ok.text
    assert client.patch(url, json={"data": {"channels": ["Myspace"]}}).status_code == 422
    assert client.patch(url, json={"data": {"name": ""}}).status_code == 422
    restored = client.post(f"{url}/versions/1/restore").json()
    assert restored["data"] == card["data"]


def test_removing_a_card_archives_it(client, db):
    project_id = confirmed_project(client)
    generate(client, project_id)
    card = stage(client, project_id)["cards"][0]
    client.post(f"/projects/{project_id}/items/{card['id']}/select")

    assert client.delete(f"/projects/{project_id}/audiences/{card['id']}").status_code == 204
    assert card["id"] not in [c["id"] for c in stage(client, project_id)["cards"]]
    kept = db.get(CampaignItem, uuid.UUID(card["id"]))
    assert kept is not None and kept.archived_at is not None and kept.selected is False
    assert client.delete(f"/projects/{project_id}/audiences/{card['id']}").status_code == 404


# --- Exclusions ---------------------------------------------------------------------------


def test_exclusions_are_cleaned_saved_and_copied(client):
    project_id = confirmed_project(client)
    r = client.put(f"/projects/{project_id}/audiences/exclusions",
                   json={"exclusions": ["  Under 18s ", "under 18s", "", "Current customers"]})
    assert r.status_code == 200, r.text
    assert r.json()["exclusions"] == ["Under 18s", "Current customers"]

    too_many = {"exclusions": [f"Group {n}" for n in range(audience.MAX_EXCLUSIONS + 1)]}
    assert client.put(f"/projects/{project_id}/audiences/exclusions", json=too_many).status_code == 422
    too_long = {"exclusions": ["x" * 201]}
    assert client.put(f"/projects/{project_id}/audiences/exclusions", json=too_long).status_code == 422

    copy_id = client.post(f"/projects/{project_id}/duplicate").json()["id"]
    assert stage(client, copy_id)["exclusions"] == ["Under 18s", "Current customers"]


# --- Review flags -------------------------------------------------------------------------


def test_sensitive_traits_the_ai_inferred_are_flagged(client, ai):
    project_id = confirmed_project(client)
    ai.use(FixedProvider({"audiences": [
        ai_card(name="Religious families", definition="Christian parents who work from home."),
        ai_card(name="Office workers", motivation="Save 40% on lighting."),
    ]}))
    generate(client, project_id)
    religious, office = stage(client, project_id)["cards"]

    terms = {f["claim"] for f in religious["review_flags"] if f["category"] == "sensitive"}
    assert terms == {"religious", "christian"}
    assert [f["category"] for f in office["review_flags"]] == ["other"]
    assert "40" in office["review_flags"][0]["claim"]


def test_a_trait_the_brief_states_is_not_flagged_and_the_users_own_words_are_not_policed(client, ai):
    project_id = confirmed_project(client, description="A reading lamp for people with diabetic eye strain.")
    ai.use(FixedProvider({"audiences": [ai_card(definition="Diabetic readers."), ai_card(name="B")]}))
    generate(client, project_id)
    assert stage(client, project_id)["cards"][0]["review_flags"] == []

    own = client.post(f"/projects/{project_id}/audiences",
                      json={"name": "Church groups", "definition": "Our church customers."}).json()
    assert own["review_flags"] == []


def test_flags_follow_the_users_edits(client):
    project_id = confirmed_project(client)
    generate(client, project_id)
    card = stage(client, project_id)["cards"][0]
    client.patch(f"/projects/{project_id}/items/{card['id']}", json={"data": {"message_angle": "Guaranteed to fix your focus."}})
    flags = stage(client, project_id)["cards"][0]["review_flags"]
    assert [f["category"] for f in flags] == ["performance"]


# --- Privacy ------------------------------------------------------------------------------


def test_audiences_are_private_and_the_example_is_read_only(client, db):
    project_id = confirmed_project(client)
    generate(client, project_id)
    card = stage(client, project_id)["cards"][0]

    db.get(Project, uuid.UUID(project_id)).is_demo = True
    db.flush()
    assert client.post(f"/projects/{project_id}/audiences/generate").status_code == 403
    assert client.delete(f"/projects/{project_id}/audiences/{card['id']}").status_code == 403

    client.post("/auth/logout")
    signup(client, "other@example.com")
    assert client.get(f"/projects/{project_id}/audiences").status_code == 404
    mine = client.post("/projects", json={"name": "Mine"}).json()["id"]
    assert client.delete(f"/projects/{mine}/audiences/{card['id']}").status_code == 404


def test_the_schema_sent_to_providers_is_strict():
    card = audience.SCHEMA["properties"]["audiences"]["items"]
    assert card["additionalProperties"] is False
    assert set(card["required"]) == FIELDS
    assert set(card["properties"]["channels"]["items"]["enum"]) == set(audience.Channel.__args__)
    assert "default" not in str(audience.SCHEMA)
