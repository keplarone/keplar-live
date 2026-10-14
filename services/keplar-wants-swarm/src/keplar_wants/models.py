"""Wire models for the Keplar Wants swarm service.

The protocol is the same one the built-in TypeScript engine speaks (src/lib/wants/engine.ts), so the sidebar tab
(src/components/app-ui/wants/KeplarWantsTab.tsx) works unchanged with either backend:

    request   {"state": WantsState | null, "input": WantsInput, "user": {"id": "...", "plan": "..."}}
    response  NDJSON lines, each one Event:
              {"type": "state", "state": {...}, "label": "Build it"}   keep and send back next turn
              {"type": "trace", "event": {...}}                         progress (routing, agents, jobs)
              {"type": "say",   "text": "..."}                          a short note
              {"type": "card",  "card": {"kind": "...", ...}}           what the tab shows next

The client's copy of the state is never trusted: every field is re-validated here (lengths, enums, ranges).
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Track(str, Enum):
    """The finite set of execution routes. Every want maps to exactly one, by deterministic pattern matching
    (intents.route); nothing interprets free text to invent a new path. Values are the wire format (stable)."""

    APPS_ENGINE = "app_game"  # questionnaire -> source files in a contained workspace
    LOGISTICS_GATEWAY = "commerce"  # radius scan -> price tiers -> address / PIN -> validated connector call
    CAP_ROUTE = "goal"  # capital / long-term goals: branching state machine -> plan -> Palmo hook
    GENERAL = "general"  # anything else: the expert swarm answers


Route = Track


class Option(BaseModel):
    label: str = Field(max_length=120)
    value: Optional[str] = Field(default=None, max_length=200)
    hint: Optional[str] = Field(default=None, max_length=120)
    other: bool = False


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    label: Optional[str] = Field(default=None, max_length=120)


class LocationQuery(BaseModel):
    query: str = Field(min_length=1, max_length=200)


class Place(BaseModel):
    id: str = Field(max_length=40)
    name: str = Field(max_length=120)
    address: Optional[str] = Field(default=None, max_length=160)
    lat: float
    lon: float
    distanceKm: float
    priceLevel: Literal[1, 2, 3, 4]
    priceNote: str = Field(max_length=80)
    tier: Literal["cheap", "moderate", "pricey", "premium"]
    simulated: bool = True


class WantsInput(BaseModel):
    """What the person just did. Exactly one field is normally set."""

    model_config = ConfigDict(extra="ignore")

    want: Optional[str] = Field(default=None, max_length=800)
    slot: Optional[str] = Field(default=None, max_length=24)
    answer: Optional[str] = Field(default=None, max_length=400)
    location: Optional[Location | LocationQuery] = None
    placeId: Optional[str] = Field(default=None, max_length=40)
    fulfilment: Optional[Literal["delivery", "pickup"]] = None
    address: Optional[str] = Field(default=None, max_length=200)
    delivery: Optional[str] = Field(default=None, max_length=40)
    confirm: Optional[bool] = None
    pin: Optional[str] = Field(default=None, pattern=r"^\d{4,6}$")


class WantsState(BaseModel):
    """The conversation so far. The client keeps it and sends it back every turn."""

    model_config = ConfigDict(extra="ignore")

    want: str = Field(min_length=1, max_length=600)
    intent: str = Field(default="general", max_length=24)
    track: Track = Track.GENERAL
    answers: dict[str, str] = Field(default_factory=dict)
    location: Optional[Location] = None
    places: Optional[list[Place]] = None
    placeId: Optional[str] = None
    fulfilment: Optional[Literal["delivery", "pickup"]] = None
    address: Optional[str] = Field(default=None, max_length=200)
    delivery: Optional[str] = Field(default=None, max_length=40)
    confirmed: bool = False
    goalState: Optional[str] = Field(default=None, max_length=24)
    workspace: Optional[str] = Field(default=None, max_length=80)

    @field_validator("answers")
    @classmethod
    def _clean_answers(cls, v: dict[str, str]) -> dict[str, str]:
        out: dict[str, str] = {}
        for k, val in list(v.items())[:30]:
            if isinstance(k, str) and k.replace("_", "").isalnum() and len(k) <= 24:
                out[k] = str(val)[:400]
        return out

    @field_validator("places")
    @classmethod
    def _cap_places(cls, v: Optional[list[Place]]) -> Optional[list[Place]]:
        return v[:8] if v else v


class User(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    plan: str = Field(default="free", max_length=24)


class OrchestrateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    state: Optional[WantsState] = None
    input: WantsInput = Field(default_factory=WantsInput)
    user: User


Card = dict[str, Any]
Event = dict[str, Any]


def card(kind: str, **fields: Any) -> Event:
    """One card event. `kind` is what the tab switches on (see KeplarWantsTab.tsx `Card`)."""
    return {"type": "card", "card": {"kind": kind, **{k: v for k, v in fields.items() if v is not None}}}


def trace(**event: Any) -> Event:
    return {"type": "trace", "event": event}


def say(text: str) -> Event:
    return {"type": "say", "text": text}
