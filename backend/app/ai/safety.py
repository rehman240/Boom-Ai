"""Plain-code checks that run on every AI answer, whichever provider wrote it.

They don't replace the model's own judgement; they make sure the two rules from the
client brief hold even when the model slips: claims about health, money or performance
are flagged for a person to review, and figures the user never gave are called out.
"""

import re

RISKY_TERMS: dict[str, tuple[str, ...]] = {
    "health": (
        "cure", "cures", "heal", "heals", "treat", "treats", "treatment", "clinically", "doctor",
        "medical", "therapy", "weight loss", "lose weight", "anxiety", "depression", "pain relief",
        "immune", "fda", "diagnose", "prevents disease", "detox",
    ),
    "finance": (
        "guaranteed return", "guaranteed returns", "investment", "invest", "profit", "passive income",
        "get rich", "financial freedom", "loan", "credit score", "crypto", "risk-free", "risk free",
        "debt-free", "double your money",
    ),
    "performance": (
        "guarantee", "guaranteed", "proven", "#1", "number one", "best in", "the best", "fastest",
        "100%", "never fails", "instantly", "overnight results", "results in", "scientifically",
        "award-winning", "most popular",
    ),
}

# Protected or sensitive traits. The client brief says the AI must not infer these for
# ad targeting, and US ad platforms restrict targeting on most of them.
SENSITIVE_TERMS: tuple[str, ...] = (
    "race", "racial", "ethnicity", "ethnic", "skin color", "nationality", "national origin",
    "religion", "religious", "christian", "christians", "muslim", "muslims", "jewish", "hindu", "church",
    "sexual orientation", "gay", "lesbian", "bisexual", "lgbt", "lgbtq", "transgender", "gender identity",
    "disability", "disabled", "pregnant", "pregnancy", "medical condition", "diagnosed", "chronic illness",
    "mental health", "diabetes", "diabetic", "cancer", "depression", "anxiety",
    "political", "democrat", "democrats", "republican", "republicans",
    "immigrant", "immigrants", "immigration status", "undocumented",
    "bankrupt", "bankruptcy", "in debt", "low-income", "low income", "credit score",
    "criminal record", "union member",
)
SENSITIVE_REASON = (
    "This describes a protected or sensitive trait the brief doesn't mention. Ads must not be "
    "targeted on traits like this; reword it or confirm it is about the product, not the person."
)

_CATEGORY_REASONS = {
    "health": "Health claims need evidence and may be regulated. A person should check this before it runs.",
    "finance": "Financial claims can be regulated. A person should check this before it runs.",
    "performance": "Performance or superiority claims need proof. A person should check this before it runs.",
}

_PATTERNS = {
    category: re.compile(r"(?<![\w#])(" + "|".join(re.escape(t) for t in terms) + r")(?!\w)", re.IGNORECASE)
    for category, terms in RISKY_TERMS.items()
}
_SENTENCE = re.compile(r"[^.!?\n]+[.!?]?")
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def risky_claims(text: str) -> list[dict[str, str]]:
    """One flag per sentence that contains a risky term, with its category and reason."""
    flags: list[dict[str, str]] = []
    for sentence in _SENTENCE.findall(text or ""):
        sentence = sentence.strip()
        for category, pattern in _PATTERNS.items():
            if sentence and pattern.search(sentence):
                flags.append({"claim": sentence[:300], "category": category, "reason": _CATEGORY_REASONS[category]})
                break
    return flags


def _normalise(number: str) -> str:
    n = number.replace(",", "")
    if "." in n:
        n = n.rstrip("0").rstrip(".")
    return n.lstrip("0") or "0"


def numbers_in(text: str) -> set[str]:
    return {_normalise(n) for n in _NUMBER.findall(text or "")}


def unsupported_numbers(answer_text: str, source_text: str) -> list[str]:
    """Figures in the answer that appear nowhere in what the user wrote."""
    allowed = numbers_in(source_text)
    return sorted(n for n in numbers_in(answer_text) if n not in allowed)


_SENSITIVE = re.compile(r"(?<!\w)(" + "|".join(re.escape(t) for t in SENSITIVE_TERMS) + r")(?!\w)", re.IGNORECASE)


def review_flags(
    text: str, *, by_ai: bool, user_text: str, claims_text: str | None = None
) -> list[dict[str, str]]:
    """Claims in a piece of campaign work that a person should check before it is used.

    Health, finance and performance claims are flagged whoever wrote them. Sensitive
    traits and figures are flagged only in the AI's work: the rule is that the AI must not
    infer or invent them, while a user writing about their own business is stating facts.

    `claims_text` is the part people will read as a promise (headline, message), when that is
    narrower than `text`: reasoning such as "this gets the fastest recognition" is not a claim.
    """
    flags = risky_claims(text if claims_text is None else claims_text)
    if by_ai:
        for term in sensitive_traits(text, user_text):
            flags.append({"claim": term, "category": "sensitive", "reason": SENSITIVE_REASON})
        invented = unsupported_numbers(text, user_text)
        if invented:
            flags.append({
                "claim": "Figures not in your brief: " + ", ".join(invented[:8]),
                "category": "other",
                "reason": "These numbers do not appear in what you wrote. Remove them or add them to the brief.",
            })
    return flags


def user_words(brief_facts: dict, exclusions: list[str]) -> str:
    """The user's own words: their brief facts and the exclusions they wrote."""
    words = [" ".join(v) if isinstance(v, list) else str(v) for v in brief_facts.values()]
    return " ".join([*words, *exclusions])


def sensitive_traits(text: str, source_text: str) -> list[str]:
    """Sensitive-trait terms in `text` that the user's own words (`source_text`) don't use."""
    given = {m.lower() for m in _SENSITIVE.findall(source_text or "")}
    found: list[str] = []
    for match in _SENSITIVE.findall(text or ""):
        term = match.lower()
        if term not in given and term not in found:
            found.append(term)
    return found
