"""Turn a Pydantic model into the strict JSON schema the providers' structured output wants.

Both Anthropic and OpenAI accept only a subset of JSON Schema in strict mode: every
property listed as required, no extra properties, and no length or size keywords. Those
limits still apply: the answer is validated against the full Pydantic model afterwards.
"""

from typing import Any

from pydantic import BaseModel

_KEEP = {"type", "properties", "required", "items", "enum", "additionalProperties", "description", "anyOf"}


def strict_json_schema(model: type[BaseModel]) -> dict[str, Any]:
    raw = model.model_json_schema()
    defs = raw.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, list):
            return [walk(n) for n in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return walk(defs[node["$ref"].split("/")[-1]])
        out = {k: walk(v) for k, v in node.items() if k in _KEEP}
        if "properties" in node:
            out["properties"] = {name: walk(prop) for name, prop in node["properties"].items()}
        if out.get("type") == "object":
            out["additionalProperties"] = False
            out["required"] = list(out.get("properties", {}))
        return out

    return walk(raw)
