from sqlalchemy import select

from app.ai.provider import AiError, _record_usage
from app.config import get_settings
from app.models import AiUsage, JobKind, JobStatus
from tests.test_brief_summary import FixedProvider, ready_project, signup, summarise


class BilledProvider(FixedProvider):
    """Reports token usage the way the real adapters do, then answers or fails."""

    name, model = "anthropic", "claude-test"

    def __init__(self, answer=None, fail_first=False):
        super().__init__(answer)
        self.fail_first = fail_first
        self.calls = 0

    def generate(self, task):
        self.calls += 1
        _record_usage(self.model, 1000, 200)
        if self.fail_first and self.calls == 1:
            raise AiError("The AI answer was cut short. Please try again.")
        return super().generate(task)


def usage_rows(db):
    return db.scalars(select(AiUsage).order_by(AiUsage.created_at)).all()


def a_summary(client, ai):
    """A real summary answer, made by the mock, so the job succeeds."""
    project_id = ready_project(client)
    summarise(client, project_id)
    answer = client.get(f"/projects/{project_id}/brief").json()["summary"]["data"]
    return project_id, answer


def test_each_model_call_is_logged_with_its_step_and_cost(client, ai, db):
    project_id, answer = a_summary(client, ai)
    assert usage_rows(db) == []  # the mock costs nothing and logs nothing

    ai.use(BilledProvider(answer))
    job = summarise(client, project_id)

    [row] = usage_rows(db)
    assert str(row.project_id) == project_id
    assert str(row.job_id) == job["id"]
    assert row.step == JobKind.BRIEF_SUMMARY
    assert (row.provider, row.model) == ("anthropic", "claude-test")
    assert (row.input_tokens, row.output_tokens) == (1000, 200)
    # Default prices: $4 and $20 per million tokens -> 4,000 + 4,000 millionths of a dollar.
    assert row.cost_micro_usd == 8000


def test_a_failed_attempt_is_still_logged(client, ai, db):
    project_id, answer = a_summary(client, ai)
    ai.use(BilledProvider(answer, fail_first=True))
    job = summarise(client, project_id)

    assert client.get(f"/projects/{project_id}/jobs/{job['id']}").json()["status"] == JobStatus.SUCCEEDED
    assert len(usage_rows(db)) == 2  # the cut-short answer was billed too


def test_prices_come_from_the_settings(client, ai, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_price_input_per_mtok", 1.0)
    monkeypatch.setattr(get_settings(), "ai_price_output_per_mtok", 5.0)
    project_id, answer = a_summary(client, ai)
    ai.use(BilledProvider(answer))
    summarise(client, project_id)
    assert usage_rows(db)[0].cost_micro_usd == 1000 + 1000


def test_usage_outlives_a_deleted_project(client, ai, db):
    project_id, answer = a_summary(client, ai)
    ai.use(BilledProvider(answer))
    summarise(client, project_id)

    assert client.delete(f"/projects/{project_id}").status_code in (200, 204)
    db.expire_all()
    [row] = usage_rows(db)
    assert row.project_id is None  # the money was spent, so the row stays


def test_the_report_adds_up_by_day_step_campaign_and_model(client, ai):
    project_id, answer = a_summary(client, ai)
    ai.use(BilledProvider(answer, fail_first=True))
    summarise(client, project_id)

    report = client.get("/account/usage").json()
    assert report["recorded_since"] is not None
    assert (report["price_input_per_mtok"], report["price_output_per_mtok"]) == (4.0, 20.0)
    for key in ("today", "this_month", "all_time"):
        assert report[key]["calls"] == 2
        assert report[key]["input_tokens"] == 2000
        assert report[key]["cost_usd"] == 0.016
    assert [r["label"] for r in report["by_step"]] == [JobKind.BRIEF_SUMMARY]
    assert [r["label"] for r in report["by_project"]] == ["NOVA Desk Lamp"]
    assert [r["label"] for r in report["by_model"]] == ["claude-test"]
    assert len(report["by_day"]) == 1 and report["by_day"][0]["calls"] == 2

    client.delete(f"/projects/{project_id}")
    assert client.get("/account/usage").json()["by_project"][0]["label"] == "Deleted campaign"


def test_an_empty_report_and_privacy(client, ai):
    project_id, answer = a_summary(client, ai)
    ai.use(BilledProvider(answer))
    summarise(client, project_id)

    client.post("/auth/logout")
    signup(client, "other@example.com")
    report = client.get("/account/usage").json()
    assert report["recorded_since"] is None
    assert report["all_time"] == {"label": "All time", "calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
    assert report["by_project"] == []

    client.post("/auth/logout")
    assert client.get("/account/usage").status_code == 401
