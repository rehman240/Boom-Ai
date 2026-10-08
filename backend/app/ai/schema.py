"""Turn a Pydantic model into the strict JSON schema the providers' structured output wants.

Both Anthropic and OpenAI accept only a subset of JSON Schema in strict mode: every
property listed as required, no extra properties, and no length or size keywords. Those
limits still apply: the answer is validated against the full Pydantic model afterwards.
So the model still knows them, they are written into each field's description instead;
otherwise a long answer fails validation for a limit the model was never told.
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
        limits = _limits_in_words(node, out.get("description", ""))
        if limits:
            out["description"] = " ".join(filter(None, [out.get("description", ""), limits]))
        if "properties" in node:
            out["properties"] = {name: walk(prop) for name, prop in node["properties"].items()}
        if out.get("type") == "object":
            out["additionalProperties"] = False
            out["required"] = list(out.get("properties", {}))
        return out

    return walk(raw)


def _limits_in_words(node: dict[str, Any], description: str) -> str:
    """"At most 600 characters." for a maxLength the strict schema has to drop, and the same
    for list sizes. Skipped when the description already gives a length, as the assets do."""
    words = []
    if "maxLength" in node and "characters" not in description:
        words.append(f"At most {node['maxLength']} characters.")
    if "minItems" in node and "maxItems" in node:
        words.append(f"{node['minItems']} to {node['maxItems']} items.")
    elif "maxItems" in node:
        words.append(f"At most {node['maxItems']} items.")
    elif "minItems" in node:
        words.append(f"At least {node['minItems']} items.")
    return " ".join(words)
