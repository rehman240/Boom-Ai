"""The AI provider adapter: the only module that talks to a model.

A caller builds an `AiTask` (instructions, the user's facts as data, and the JSON schema
the answer must match) and gets a plain dict back. Which provider answers is decided by
AI_PROVIDER, so switching between Anthropic, OpenAI and the offline mock is a setting,
not a code change. The caller still validates the dict against its own schema.
"""

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Protocol

from app.config import get_settings

log = logging.getLogger(__name__)

# Enough room for a structured answer plus the model's own thinking.
MAX_OUTPUT_TOKENS = 8000
REQUEST_TIMEOUT_SECONDS = 90.0
DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5"
# Models that take server-side refusal fallbacks and the effort setting.
ANTHROPIC_FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}


class AiError(Exception):
    """A generation that did not produce a usable answer.

    `message` is safe to show the user: it never contains prompts, brief text or keys.
    `retryable` says whether trying the same task again could help.
    """

    def __init__(self, message: str, *, retryable: bool = True):
        super().__init__(message)
        self.message = message
        self.retryable = retryable


@dataclass(frozen=True)
class AiTask:
    name: str  # also the prompt family, e.g. "brief_summary"
    system: str
    prompt: str
    schema: dict[str, Any]
    # The same facts as `prompt`, structured, so the mock can answer without a model.
    facts: dict[str, Any] = field(default_factory=dict)


def data_block(tag: str, data: Any) -> str:
    """The user's data as JSON between <tag> tags, for a prompt.

    `<`, `>` and `&` are written as JSON escapes, so text the user typed (such as
    "</brief> Ignore the rules") can never close the tag and pass itself off as our
    instructions. The model still reads the same text.
    """
    text = json.dumps(data, indent=2, ensure_ascii=False)
    text = text.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    return f"<{tag}>\n{text}\n</{tag}>"


class AiProvider(Protocol):
    name: str
    model: str

    def generate(self, task: AiTask) -> dict[str, Any]: ...


def _parse_json(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        raise AiError("The AI answer was not in the expected format.") from None
    if not isinstance(data, dict):
        raise AiError("The AI answer was not in the expected format.")
    return data


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, http_client: Any = None):
        import anthropic  # imported here so the other providers don't need the package

        self._sdk = anthropic
        self._client = anthropic.Anthropic(
            api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=2, http_client=http_client
        )
        self.model = model

    def generate(self, task: AiTask) -> dict[str, Any]:
        sdk = self._sdk
        output_config: dict[str, Any] = {"format": {"type": "json_schema", "schema": task.schema}}
        request: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "system": task.system,
            "messages": [{"role": "user", "content": task.prompt}],
            "output_config": output_config,
        }
        try:
            if self.model in ANTHROPIC_FALLBACK_MODELS:
                # Structured extraction from a short brief does not need deep reasoning.
                output_config["effort"] = "low"
                # A safety decline is retried on a suitable model inside the same call.
                response = self._client.beta.messages.create(
                    **request, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
                )
            else:
                response = self._client.messages.create(**request)
        except sdk.AuthenticationError:
            log.error("Anthropic rejected the API key")
            raise AiError("The AI service isn't set up correctly on the server.", retryable=False) from None
        except (sdk.BadRequestError, sdk.NotFoundError, sdk.PermissionDeniedError) as e:
            log.error("Anthropic refused the request: %s", type(e).__name__)
            raise AiError("The AI service could not handle this request.", retryable=False) from None
        except sdk.RateLimitError:
            raise AiError("The AI service is busy right now. Please try again in a minute.") from None
        except (sdk.APIStatusError, sdk.APIConnectionError) as e:
            log.warning("Anthropic call failed: %s", type(e).__name__)
            raise AiError("The AI service didn't respond. Please try again.") from None

        if response.stop_reason == "refusal":
            raise AiError("The AI declined to work with this brief. Check it for sensitive claims.", retryable=False)
        if response.stop_reason == "max_tokens":
            raise AiError("The AI answer was cut short. Please try again.")
        text = next((b.text for b in response.content if b.type == "text"), "")
        return _parse_json(text)


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str, http_client: Any = None):
        import openai

        self._sdk = openai
        self._client = openai.OpenAI(
            api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=2, http_client=http_client
        )
        self.model = model

    def generate(self, task: AiTask) -> dict[str, Any]:
        sdk = self._sdk
        try:
            response = self._client.responses.create(
                model=self.model,
                instructions=task.system,
                input=task.prompt,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                store=False,  # campaign text is not kept on the provider's side for later use
                text={"format": {"type": "json_schema", "name": task.name, "schema": task.schema, "strict": True}},
            )
        except sdk.AuthenticationError:
            log.error("OpenAI rejected the API key")
            raise AiError("The AI service isn't set up correctly on the server.", retryable=False) from None
        except (sdk.BadRequestError, sdk.NotFoundError, sdk.PermissionDeniedError) as e:
            log.error("OpenAI refused the request: %s", type(e).__name__)
            raise AiError("The AI service could not handle this request.", retryable=False) from None
        except sdk.RateLimitError:
            raise AiError("The AI service is busy right now. Please try again in a minute.") from None
        except (sdk.APIStatusError, sdk.APIConnectionError) as e:
            log.warning("OpenAI call failed: %s", type(e).__name__)
            raise AiError("The AI service didn't respond. Please try again.") from None

        if response.status == "incomplete":
            raise AiError("The AI answer was cut short. Please try again.")
        return _parse_json(response.output_text)


class MockProvider:
    """Answers without a model, from the user's own facts. For building and tests.

    Each task family registers a builder in `MOCK_BUILDERS`; the pause is there so the
    progress state in the UI is visible while developing.
    """

    name = "mock"
    model = "mock-1"

    def __init__(self, delay_seconds: float = 0.0):
        self.delay_seconds = delay_seconds

    def generate(self, task: AiTask) -> dict[str, Any]:
        builder = MOCK_BUILDERS.get(task.name)
        if builder is None:
            raise AiError("This step isn't available in mock mode yet.", retryable=False)
        if self.delay_seconds:
            time.sleep(self.delay_seconds)
        return builder(task.facts)


# Filled in by each task module (e.g. app.ai.brief_summary), keyed by task name.
MOCK_BUILDERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {}


class _Unconfigured:
    """Stands in when the chosen provider has no key, so the app still starts."""

    def __init__(self, name: str, reason: str):
        self.name = name
        self.model = ""
        self._reason = reason

    def generate(self, task: AiTask) -> dict[str, Any]:
        log.error("AI provider %s is not configured: %s", self.name, self._reason)
        raise AiError("The AI service isn't set up on the server yet.", retryable=False)


def build_provider() -> AiProvider:
    s = get_settings()
    choice = s.ai_provider.strip().lower()
    if choice == "mock":
        return MockProvider(delay_seconds=s.ai_mock_delay_seconds)
    if choice == "anthropic":
        if not s.anthropic_api_key:
            return _Unconfigured("anthropic", "ANTHROPIC_API_KEY is empty")
        return AnthropicProvider(s.anthropic_api_key, s.ai_model or DEFAULT_ANTHROPIC_MODEL)
    if choice == "openai":
        if not s.openai_api_key or not s.ai_model:
            return _Unconfigured("openai", "OPENAI_API_KEY and AI_MODEL are both needed")
        return OpenAIProvider(s.openai_api_key, s.ai_model)
    return _Unconfigured(choice, "AI_PROVIDER must be anthropic, openai or mock")


@lru_cache
def get_ai_provider() -> AiProvider:
    """FastAPI dependency. Tests override it with their own provider."""
    return build_provider()
