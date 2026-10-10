"""Budget arithmetic in whole cents, so every split adds up to the total exactly.

The AI only suggests shares; the amounts are always worked out here. Nothing in this
module touches the database, so the rules are easy to test on their own.
"""

from collections.abc import Sequence
from typing import Any


class BudgetError(ValueError):
    """A change that would break the budget. The message is safe to show the user."""


def split(total_cents: int, weights: Sequence[float]) -> list[int]:
    """Share `total_cents` out in proportion to `weights`, adding up to it exactly.

    Largest remainder: everyone gets the whole cents of their share, and the cents left
    over go to the biggest fractions, earlier lines first on a tie. Zero weights everywhere
    means an equal split.
    """
    if not weights:
        return []
    if total_cents < 0:
        raise BudgetError("A budget can't be negative.")
    weight_sum = sum(weights)
    if weight_sum <= 0:
        weights = [1.0] * len(weights)
        weight_sum = float(len(weights))
    exact = [total_cents * w / weight_sum for w in weights]
    amounts = [int(x) for x in exact]
    left = total_cents - sum(amounts)
    by_fraction = sorted(range(len(exact)), key=lambda i: (-(exact[i] - amounts[i]), i))
    for i in by_fraction[:left]:
        amounts[i] += 1
    return amounts


def percents(lines: Sequence[dict[str, Any]], total_cents: int) -> dict[str, float]:
    """Each line's share of the total, to one decimal, for display."""
    if total_cents <= 0:
        return {line["id"]: 0.0 for line in lines}
    return {line["id"]: round(100 * line["amount_cents"] / total_cents, 1) for line in lines}


def money(cents: int) -> str:
    return f"${cents / 100:,.2f}".replace(".00", "")


def rebalance(lines: list[dict[str, Any]], total_cents: int, fixed_ids: set[str] = frozenset()) -> list[dict[str, Any]]:
    """Make the lines add up to `total_cents` again by changing only the free ones.

    Locked lines and the ones in `fixed_ids` (the line the user just changed) keep their
    amounts. The rest share what is left in proportion to what they had before, or equally
    if they all had nothing. Returns new line dicts; the input is left as it was.
    """
    fixed = {line["id"] for line in lines if line.get("locked")} | set(fixed_ids)
    kept = sum(line["amount_cents"] for line in lines if line["id"] in fixed)
    free = [line for line in lines if line["id"] not in fixed]
    remaining = total_cents - kept
    if remaining < 0:
        raise BudgetError(
            f"That is more than the budget allows. With the locked channels it comes to {money(kept)}, "
            f"and the budget is {money(total_cents)}."
        )
    if not free:
        if remaining != 0:
            raise BudgetError("Unlock another channel so the rest of the budget can move there.")
        return [dict(line) for line in lines]
    shares = split(remaining, [line["amount_cents"] for line in free])
    new_amounts = {line["id"]: amount for line, amount in zip(free, shares)}
    return [{**line, "amount_cents": new_amounts.get(line["id"], line["amount_cents"])} for line in lines]
