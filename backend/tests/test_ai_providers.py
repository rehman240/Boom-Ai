"""The real provider adapters, against a fake HTTP server: request shape and error handling.

No network and no key: `httpx2.MockTransport` answers in place of the provider's API.
"""

import json

import httpx2
import pytest

from app.ai import brief_summary
from app.ai.provider import AiError, AnthropicProvider, OpenAIProvider

FACTS = {"business_name": "NOVA", "product_or_service": "Desk lamp", "goal": "Preorders"}
ANSWER = brief_summary._mock_summary(FACTS)


def fake(handler):
    seen = []

    def record(request):
        seen.append(request)
        return handler(request)

    return httpx2.Client(transport=httpx2.MockTransport(record)), seen


def anthropic_reply(stop_reason="end_turn", text=json.dumps(ANSWER)):
    return httpx2.Response(
        200,
        json={
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "claude-opus-5-5",
            "content": [{"type": "text", "text": text}],
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 10},
        },
    )


def test_anthropic_sends_the_schema_and_returns_the_parsed_answer():
    client, seen = fake(lambda r: anthropic_reply())
    provider = AnthropicProvider("test-key", "claude-opus-5-5", http_client=client)

    assert provider.generate(brief_summary.build_task(FACTS)) == ANSWER

    body = json.loads(seen[0].content)
    assert seen[0].url.path == "/v1/messages"
    assert seen[0].headers["x-api-key"] == "test-key"
    assert body["output_config"]["format"] == {"type": "json_schema", "schema": brief_summary.SCHEMA}
    assert body["output_config"]["effort"] == "low"
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in seen[0].headers["anthropic-beta"]
    assert body["system"] == brief_summary.SYSTEM
    # The brief goes in as data inside tags.
    assert "<brief>" in body["messages"][0]["content"]


def test_anthropic_other_models_skip_the_newer_options():
    client, seen = fake(lambda r: anthropic_reply())
    AnthropicProvider("k", "claude-haiku-4-5", http_client=client).generate(brief_summary.build_task(FACTS))
    body = json.loads(seen[0].content)
    assert "fallbacks" not in body and "effort" not in body["output_config"]


@pytest.mark.parametrize(
    ("reply", "retryable"),
    [
        (lambda r: anthropic_reply(stop_reason="refusal"), False),
        (lambda r: anthropic_reply(stop_reason="max_tokens"), True),
        (lambda r: anthropic_reply(text="not json"), True),
        (lambda r: httpx2.Response(401, json={"type": "error", "error": {"type": "authentication_error", "message": "bad key"}}), False),
        (lambda r: httpx2.Response(400, json={"type": "error", "error": {"type": "invalid_request_error", "message": "x"}}), False),
    ],
)
def test_anthropic_failures_become_plain_errors(reply, retryable):
    client, _ = fake(reply)
    provider = AnthropicProvider("k", "claude-opus-5-5", http_client=client)
    with pytest.raises(AiError) as e:
        provider.generate(brief_summary.build_task(FACTS))
    assert e.value.retryable is retryable
    # Messages are for users: no key, no brief text, no provider detail.
    assert "bad key" not in e.value.message and "NOVA" not in e.value.message


def openai_reply(status="completed", text=json.dumps(ANSWER)):
    return httpx2.Response(
        200,
        json={
            "id": "resp_1",
            "object": "response",
            "created_at": 0,
            "model": "test-model",
            "status": status,
            "output": [
                {
                    "type": "message",
                    "id": "msg_1",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{"type": "output_text", "text": text, "annotations": []}],
                }
            ],
            "parallel_tool_calls": True,
            "tool_choice": "auto",
            "tools": [],
        },
    )


def test_openai_sends_a_strict_schema_and_does_not_store_the_request():
    client, seen = fake(lambda r: openai_reply())
    provider = OpenAIProvider("test-key", "test-model", http_client=client)

    assert provider.generate(brief_summary.build_task(FACTS)) == ANSWER

    body = json.loads(seen[0].content)
    assert seen[0].url.path == "/v1/responses"
    assert body["store"] is False
    assert body["text"]["format"]["strict"] is True
    assert body["text"]["format"]["schema"] == brief_summary.SCHEMA
    assert body["instructions"] == brief_summary.SYSTEM


def test_openai_incomplete_answer_is_retryable():
    client, _ = fake(lambda r: openai_reply(status="incomplete"))
    with pytest.raises(AiError) as e:
        OpenAIProvider("k", "m", http_client=client).generate(brief_summary.build_task(FACTS))
    assert e.value.retryable
