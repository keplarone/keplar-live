"""Deterministic intent routing: the want text -> (track, intent). Pure regex, ordered by specificity, so the same want always
takes the same track (tests/test_intents.py pins the examples from the product brief)."""
from __future__ import annotations

import re

from .models import Track

RULES: list[tuple[str, Track, re.Pattern[str]]] = [
    ("roblox", Track.APPS_ENGINE, re.compile(r"\broblox\b|\bobby\b|\brobux\b|\bluau\b", re.I)),
    ("build_app", Track.APPS_ENGINE, re.compile(r"\b(build|make|create|code|develop|design)\b.{0,40}\b(app|application|website|web ?site|site|saas|platform|tool|dashboard|landing page|game|portfolio|store|bot|extension)\b|^(an? )?(app|website|web app|game)\b", re.I)),
    ("money", Track.CAP_ROUTE, re.compile(r"\b(million|millionaire|billionaire|rich|wealthy|\$\s?\d[\d,.]*\s?(k|m|million|thousand)?|\d+\s?(k|thousand|million) dollars|make money|passive income|financial freedom|side hustle|retire early|start a business|my own business)\b", re.I)),
    ("goal", Track.CAP_ROUTE, re.compile(r"\b(become|get into|lose \d+|run a marathon|learn .{1,30} in \d+|by (next|this) (year|summer)|in \d+ (months|years))\b", re.I)),
    ("food", Track.LOGISTICS_GATEWAY, re.compile(r"\b(coffee|latte|espresso|cappuccino|mocha|frappuccino|cold brew|americano|tea|boba|smoothie|pizza|burgers?|sushi|tacos?|burrito|wings|food|lunch|dinner|breakfast|brunch|snack|donuts?|ice cream|dessert|something to eat|takeout|fries|sandwich|salad)\b", re.I)),
]


def route(want: str) -> tuple[Track, str]:
    w = want.strip()
    for intent, track, rx in RULES:
        if rx.search(w):
            return track, intent
    return Track.GENERAL, "general"


def clean_want(raw: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^\s*i\s+want\s+", "", raw, flags=re.I)).strip()[:600]
