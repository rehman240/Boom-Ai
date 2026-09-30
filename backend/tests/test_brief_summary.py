import uuid
from datetime import UTC, datetime, timedelta

from app.ai.brief_summary import PROMPT_VERSION, SCHEMA
from app.ai.provider import AiError, MockProvider, build_provider
from app.config import get_settings
from app.jobs import STALE_MESSAGE
from app.models import AiJob, JobKind, JobStatus, Project, ProjectStage

FULL = {
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


def ready_project(client, **extra):
    signup(client)
    project_id = client.post("/projects", json={"name": "NOVA Desk Lamp"}).json()["id"]
    client.patch(f"/projects/{project_id}/brief", json={**FULL, **extra})
    return project_id


def summarise(client, project_id):
    """Start the job; the test client runs background tasks before returning."""
    r = client.post(f"/projects/{project_id}/brief/summary")
    assert r.status_code == 202, r.text
    return r.json()


class FailingProvider:
    name, model = "test", "failing"

    def __init__(self, retryable=True):
        self.calls = 0
        self.retryable = retryable

    def generate(self, task):
        self.calls += 1
        raise AiError("The AI service didn't respond. Please try again.", retryable=self.retryable)


class FixedProvider:
    """Returns a fixed answer, to test what the app does with a model's output."""

    name, model = "test", "fixed"

    def __init__(self, answer):
        self.answer = answer

    def generate(self, task):
        return self.answer


def test_summary_runs_as_a_job_and_is_saved_with_its_provenance(client):
    project_id = ready_project(client)
    job = summarise(client, project_id)
    assert job["kind"] == JobKind.BRIEF_SUMMARY

    polled = client.get(f"/projects/{project_id}/jobs/{job['id']}").json()
    assert polled["status"] == JobStatus.SUCCEEDED
    assert polled["attempts"] == 1

    state = client.get(f"/projects/{project_id}/brief").json()
    summary = state["summary"]
    assert summary["status"] == "ready"
    assert summary["provider"] == "mock"
    assert summary["prompt_version"] == PROMPT_VERSION
    assert state["summary_job"]["id"] == job["id"]

    data = summary["data"]
    assert data["conversion_goal"] == "Preorders"
    # Every fact says which field it is based on, and uses the user's own words.
    by_source = {f["source"]: f["value"] for f in data["facts"]}
    assert by_source["differentiators"] == FULL["differentiators"]
    assert by_source["budget"] == "12,000 USD"


def test_mock_summary_asks_for_a_price_instead_of_inventing_one(client):
    project_id = ready_project(client)
    summarise(client, project_id)
    data = client.get(f"/projects/{project_id}/brief").json()["summary"]["data"]

    assert "No price or offer terms were given" in data["offer"]
    assert any("price" in q for q in data["missing_info"])
    assert "$" not in data["offer"]


def test_risky_claims_in_the_brief_are_flagged_for_review(client):
    project_id = ready_project(
        client, differentiators="Clinically shown to ease eye strain. Guaranteed to double your focus."
    )
    summarise(client, project_id)
    flags = client.get(f"/projects/{project_id}/brief").json()["summary"]["data"]["review_flags"]

    assert {f["category"] for f in flags} >= {"health", "performance"}


def test_figures_the_user_never_gave_are_flagged(client, ai):
    project_id = ready_project(client)
    ai.use(
        FixedProvider(
            {
                "overview": "NOVA is loved by 10,000 customers.",
                "offer": "Rechargeable desk lamp for $89.",
                "conversion_goal": "Preorders",
                "audience_constraints": ["Location: United States"],
                "facts": [{"label": "Budget", "value": "12,000 USD", "source": "budget"}],
                "assumptions": [],
                "missing_info": [],
                "review_flags": [],
            }
        )
    )
    summarise(client, project_id)
    flags = client.get(f"/projects/{project_id}/brief").json()["summary"]["data"]["review_flags"]

    invented = [f for f in flags if f["claim"].startswith("Figures not in your brief")]
    assert len(invented) == 1
    # 10,000 and 89 are made up; the budget the user gave is not flagged.
    assert "10000" in invented[0]["claim"] and "89" in invented[0]["claim"]
    assert "12000" not in invented[0]["claim"]


def test_confirming_moves_the_campaign_on_and_editing_makes_it_outdated(client, db):
    project_id = ready_project(client)
    summarise(client, project_id)

    r = client.post(f"/projects/{project_id}/brief/summary/confirm")
    assert r.status_code == 200
    assert r.json()["summary"]["status"] == "confirmed"
    assert r.json()["brief"]["summary_confirmed_at"] is not None
    assert db.get(Project, project_id).stage == ProjectStage.TARGET

    # Changing a fact after confirming means the confirmed summary no longer matches.
    r = client.patch(f"/projects/{project_id}/brief", json={"goal": "Sales"})
    assert r.json()["summary"]["status"] == "outdated"
    assert client.post(f"/projects/{project_id}/brief/summary/confirm").status_code == 409

    # A fresh summary of the new brief needs its own confirmation.
    summarise(client, project_id)
    summary = client.get(f"/projects/{project_id}/brief").json()["summary"]
    assert summary["status"] == "ready"
    assert summary["data"]["conversion_goal"] == "Sales"


def test_confirm_needs_a_summary(client):
    project_id = ready_project(client)
    assert client.post(f"/projects/{project_id}/brief/summary/confirm").status_code == 409


def test_summary_needs_the_required_fields(client):
    signup(client)
    project_id = client.post("/projects", json={"name": "Empty"}).json()["id"]
    r = client.post(f"/projects/{project_id}/brief/summary")
    assert r.status_code == 409


def test_a_failed_generation_keeps_the_existing_summary_and_can_be_retried(client, ai):
    project_id = ready_project(client)
    summarise(client, project_id)
    before = client.get(f"/projects/{project_id}/brief").json()["summary"]

    failing = FailingProvider()
    ai.use(failing)
    job = summarise(client, project_id)

    polled = client.get(f"/projects/{project_id}/jobs/{job['id']}").json()
    assert polled["status"] == JobStatus.FAILED
    assert polled["error"] == "The AI service didn't respond. Please try again."
    assert polled["attempts"] == 2  # one automatic retry
    assert failing.calls == 2

    state = client.get(f"/projects/{project_id}/brief").json()
    assert state["summary"] == before  # nothing was erased
    assert state["summary_job"]["status"] == JobStatus.FAILED

    # Retrying is just starting again.
    ai.use(MockProvider())
    retry = summarise(client, project_id)
    assert client.get(f"/projects/{project_id}/jobs/{retry['id']}").json()["status"] == JobStatus.SUCCEEDED


def test_a_permanent_error_is_not_retried(client, ai):
    project_id = ready_project(client)
    failing = FailingProvider(retryable=False)
    ai.use(failing)
    job = summarise(client, project_id)

    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["attempts"] == 1
    assert failing.calls == 1


def test_a_malformed_answer_fails_with_a_plain_message(client, ai):
    project_id = ready_project(client)
    ai.use(FixedProvider({"overview": "Only half an answer"}))
    job = summarise(client, project_id)

    polled = client.get(f"/projects/{project_id}/jobs/{job['id']}").json()
    assert polled["status"] == JobStatus.FAILED
    assert polled["error"] == "The AI answer was not in the expected format."
    assert client.get(f"/projects/{project_id}/brief").json()["summary"] is None


def test_a_click_while_a_job_is_running_rejoins_it(client, db):
    project_id = ready_project(client)
    queued = AiJob(project_id=uuid.UUID(project_id), kind=JobKind.BRIEF_SUMMARY, status=JobStatus.RUNNING,
                   started_at=datetime.now(UTC))
    db.add(queued)
    db.flush()

    r = client.post(f"/projects/{project_id}/brief/summary")
    assert r.json()["id"] == str(queued.id)


def test_a_job_stuck_for_too_long_is_marked_failed(client, db):
    project_id = ready_project(client)
    stuck = AiJob(project_id=uuid.UUID(project_id), kind=JobKind.BRIEF_SUMMARY, status=JobStatus.RUNNING,
                  started_at=datetime.now(UTC) - timedelta(minutes=30))
    db.add(stuck)
    db.flush()

    polled = client.get(f"/projects/{project_id}/jobs/{stuck.id}").json()
    assert polled["status"] == JobStatus.FAILED
    assert polled["error"] == STALE_MESSAGE

    # And it doesn't block a new attempt.
    fresh = summarise(client, project_id)
    assert fresh["id"] != str(stuck.id)


def test_ai_can_be_paused(client, monkeypatch):
    project_id = ready_project(client)
    monkeypatch.setattr(get_settings(), "ai_enabled", False)
    r = client.post(f"/projects/{project_id}/brief/summary")
    assert r.status_code == 503
    assert "paused" in r.json()["detail"]


def test_generations_are_rate_limited_per_user(client, monkeypatch):
    project_id = ready_project(client)
    monkeypatch.setattr(get_settings(), "rate_limit_ai", "2/hour")
    summarise(client, project_id)
    summarise(client, project_id)
    assert client.post(f"/projects/{project_id}/brief/summary").status_code == 429


def test_jobs_and_summaries_are_private(client):
    project_id = ready_project(client)
    job = summarise(client, project_id)
    client.cookies.clear()
    signup(client, email="stranger@example.com")

    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").status_code == 404
    assert client.post(f"/projects/{project_id}/brief/summary").status_code == 404
    assert client.post(f"/projects/{project_id}/brief/summary/confirm").status_code == 404


def test_a_job_id_from_another_campaign_is_not_found(client):
    project_id = ready_project(client)
    job = summarise(client, project_id)
    other = client.post("/projects", json={"name": "Other"}).json()["id"]
    assert client.get(f"/projects/{other}/jobs/{job['id']}").status_code == 404


def test_the_example_campaign_cannot_start_a_generation(client, db):
    project_id = ready_project(client)
    db.get(Project, project_id).is_demo = True
    db.flush()
    assert client.post(f"/projects/{project_id}/brief/summary").status_code == 403


def test_a_summary_in_an_old_shape_is_ignored(client, db):
    from sqlalchemy import select

    from app.models import Brief

    project_id = ready_project(client)
    db.scalar(select(Brief).where(Brief.project_id == project_id)).summary = {"facts": ["rechargeable"]}
    db.flush()
    assert client.get(f"/projects/{project_id}/brief").json()["summary"] is None


def test_the_schema_sent_to_providers_is_strict():
    def check(node):
        if isinstance(node, dict):
            assert "$ref" not in node and "maxLength" not in node
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            for value in node.values():
                check(value)
        elif isinstance(node, list):
            for value in node:
                check(value)

    check(SCHEMA)


def test_a_provider_without_a_key_fails_safely(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    provider = build_provider()
    try:
        provider.generate(None)
    except AiError as e:
        assert not e.retryable
        assert "set up" in e.message
    else:
        raise AssertionError("expected an AiError")
