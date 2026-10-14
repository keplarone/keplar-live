"""The multi-turn questionnaires. A question is asked only when its slot is unanswered and its `when` holds."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Optional

from ..models import WantsState


@dataclass(frozen=True)
class Q:
    slot: str
    question: str
    options: tuple[str, ...]
    other: Optional[str] = "Other (be specific)"
    multi: bool = False
    when: Callable[[WantsState], bool] = field(default=lambda s: True)
    skip_if: Optional[re.Pattern[str]] = None

    def as_card(self, step: int, total: int) -> dict:
        opts = [{"label": o} for o in self.options] + ([{"label": self.other, "other": True}] if self.other else [])
        return {"kind": "question", "slot": self.slot, "question": self.question, "options": opts, "multi": self.multi or None, "step": step, "total": total}


def _coffee(s: WantsState) -> bool:
    return bool(re.search(r"\b(coffee|latte|espresso|cappuccino|mocha|frappuccino|cold brew|americano)\b", s.want, re.I))


def _generic_food(s: WantsState) -> bool:
    return bool(re.fullmatch(r"(a |an |some )?(coffee|food|something to eat|lunch|dinner|breakfast|a snack|snack|dessert|takeout)[.!]?", s.want.strip(), re.I))


APP = [
    Q("kind", "What are you building?", ("Website", "Web app with accounts & data", "Online store", "Browser game", "Tool or calculator")),
    Q("purpose", "Who is it for, and what's the one thing it has to do?", ("For my business: get customers", "For me: track something", "For a group: share and plan together"), "Describe it"),
    Q("features", "Which of these does it need?", ("Sign-in & accounts", "Saving data", "Payments", "Booking / scheduling", "Admin dashboard", "None of these"), None, multi=True),
    Q("look", "How should it look?", ("Clean & minimal", "Bold & colorful", "Dark & techy", "Playful", "Let Keplar pick"), None),
]
ROBLOX = [
    Q("genre", "What kind of Roblox game?", ("Obby", "Tycoon", "Simulator", "Horror", "Roleplay / RPG", "Battle / PvP"), skip_if=re.compile(r"\b(obby|tycoon|simulator|horror|roleplay|rpg|pvp)\b", re.I)),
    Q("loop", "What do players do every minute of it?", ("Jump through levels and checkpoints", "Collect, upgrade and rebirth", "Build and earn from a base", "Fight players or enemies"), "Describe the gameplay"),
    Q("players", "How many players per server?", ("Solo or small (1–8)", "Medium (10–20)", "Big servers (30+)"), None),
    Q("monetize", "Do you want it to make Robux?", ("Yes: gamepasses", "Yes: developer products", "Not yet"), None),
]
FOOD = [
    Q("item", "What type of coffee do you want?", ("Latte", "Cappuccino", "Iced coffee / cold brew", "Americano", "Mocha", "Espresso"), when=lambda s: _coffee(s) and _generic_food(s)),
    Q("item", "What are you craving?", ("Pizza", "Burgers", "Mexican", "Sushi", "Healthy / salads", "Breakfast"), when=lambda s: not _coffee(s) and _generic_food(s)),
    Q("details", "How do you take it?", ("Medium, regular milk", "Large, oat milk", "Small, black", "Extra shot, sweet"), "Size, milk, sugar…", when=_coffee),
    Q("source", "Do you want it from a specific place?", ("Closest to me", "Cheapest", "Best rated"), "A specific place (type it)"),
]
NICHES = ("Online store / e-commerce", "Local service (cleaning, lawn care)", "App or SaaS", "Food & drinks", "Digital products & courses", "Marketing agency", "Real estate", "Fitness & wellness", "Clothing brand", "Reselling", "AI automation services")
GOAL = [
    Q("path", "Which way do you want to get there?", ("Business", "Content creation", "Investing", "Freelancing / services", "Higher-paying career")),
    Q("niche", "Pick a niche", NICHES, "My idea (describe it)", when=lambda s: "business" in s.answers.get("path", "").lower()),
    Q("platform", "Where will you post?", ("YouTube", "TikTok", "Instagram", "Podcast", "Twitch"), None, multi=True, when=lambda s: "content" in s.answers.get("path", "").lower()),
    Q("topic", "What will your content be about?", ("Gaming", "Money & business", "Fitness", "Comedy", "Tech & AI"), when=lambda s: "content" in s.answers.get("path", "").lower()),
    Q("capital", "How much money can you start with?", ("$0", "Under $500", "$500 – $2,000", "$2,000 – $10,000", "$10,000+"), None),
    Q("time", "How much time can you put in each week?", ("Under 5 hours", "5–15 hours", "15–30 hours", "Full time"), None),
    Q("skills", "What are you already good at?", ("Talking to people / sales", "Design", "Coding", "Writing", "Video", "Nothing yet"), None, multi=True),
    Q("timeline", "By when?", ("1 year", "3 years", "5 years", "10 years", "As fast as possible"), None),
]


def pending(qs: list[Q], s: WantsState) -> list[Q]:
    return [q for q in qs if q.slot not in s.answers and q.when(s) and not (q.skip_if and q.skip_if.search(s.want))]


def next_question_card(qs: list[Q], s: WantsState) -> Optional[dict]:
    left = pending(qs, s)
    if not left:
        return None
    total = len(pending(qs, s.model_copy(update={"answers": {}})))
    step = max(1, total - len(left) + 1)
    return left[0].as_card(step, max(total, step))
