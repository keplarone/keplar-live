"""Track B: geolocation & commerce (food / coffee).

    questions -> location -> SIMULATED radius scan -> price tiers (cheap -> expensive) -> pick -> delivery/pickup
    -> address -> connect a delivery platform (OAuth 2.0 handler, or a generated placeholder) -> confirm (PIN or
    "are you sure") -> connector.place_order() -> hand-off card (Palmo on the desktop, or the platform's page)

The radius scan is a deterministic simulation (seeded by the location and category) so the pipeline can be built and tested
without a places API; every place is marked `simulated: true` and the card says so. To use real data, replace
`simulated_scan` with a provider call returning the same `Place` shape (the TypeScript engine uses OpenStreetMap).
"""
from __future__ import annotations

import math
import random
from typing import AsyncIterator

from ..agents import ROUTER, Frame
from ..connectors import Order
from ..context import Context
from ..models import Event, Place, Track, WantsState, card, say
from .questions import FOOD, next_question_card

VENUES = {
    "coffee": [("Dunkin'", 1), ("Corner Coffee Cart", 1), ("Starbucks", 2), ("Peet's Coffee", 2), ("Local Roasters", 2), ("Blue Bottle Coffee", 3), ("La Colombe", 3), ("The Espresso Atelier", 4)],
    "pizza": [("Little Caesars", 1), ("Domino's", 1), ("Joe's Slice", 2), ("Pizza Hut", 2), ("Brick Oven Co.", 3), ("Trattoria Napoli", 4)],
    "burgers": [("McDonald's", 1), ("Wendy's", 1), ("Five Guys", 2), ("Shake Shack", 2), ("The Burger Joint", 3), ("Prime Burger Bar", 4)],
    "sushi": [("Sushi Express", 2), ("Kaiten Sushi", 2), ("Sakura House", 3), ("Omakase Room", 4)],
    "mexican": [("Taco Bell", 1), ("Chipotle", 2), ("Taqueria El Sol", 1), ("Cantina Verde", 3)],
    "food": [("Subway", 1), ("Panera Bread", 2), ("Chipotle", 2), ("Neighborhood Diner", 2), ("Bistro 21", 3), ("Chef's Table", 4)],
}
TIER = {1: "cheap", 2: "moderate", 3: "pricey", 4: "premium"}
DOLLARS = {1: "$", 2: "$$", 3: "$$$", 4: "$$$$"}


def simulated_scan(lat: float, lon: float, category: str, radius_km: float, named: str | None = None, sort: str = "price") -> list[Place]:
    rng = random.Random(f"{round(lat, 3)}:{round(lon, 3)}:{category}")
    venues = VENUES.get(category, VENUES["food"])
    if named:
        venues = [(named.strip()[:60], 2)] + [v for v in venues if v[0].lower() != named.lower()]
    out: list[Place] = []
    for i, (name, level) in enumerate(venues[:8]):
        d = round(rng.uniform(0.15, radius_km), 2)
        ang = rng.uniform(0, 2 * math.pi)
        plat, plon = lat + (d / 111.0) * math.cos(ang), lon + (d / (111.0 * max(0.2, math.cos(math.radians(lat))))) * math.sin(ang)
        out.append(Place(id=f"sim/{category}/{i}", name=name, address=f"{rng.randint(10, 999)} {rng.choice(['Main', 'Oak', 'Market', 'Pine', 'Elm', 'Broadway'])} St", lat=plat, lon=plon, distanceKm=d, priceLevel=level, priceNote=f"{DOLLARS[level]} · {TIER[level]} (simulated)", tier=TIER[level]))
    key = (lambda p: p.distanceKm) if sort == "distance" else (lambda p: (p.priceLevel, p.distanceKm))
    return sorted(out, key=key)


async def run(state: WantsState, user_id: str, ctx: Context, pin: str | None, confirm: bool) -> AsyncIterator[Event]:
    q = next_question_card(FOOD, state)
    if q:
        yield {"type": "card", "card": q}
        return
    if not state.location:
        yield card("location", question="Where are you? Keplar looks for places near you.")
        return
    if not state.places:
        f = ROUTER.dispatch(Frame("scan", state.want, Track.COMMERCE, dict(state.answers)))
        state.places = simulated_scan(state.location.lat, state.location.lon, f.data["category"], f.data["radius_km"], f.data.get("named"), f.data["sort"])
        yield {"type": "state", "state": state.model_dump(mode="json"), "label": "Order it"}
        yield card("places", places=[p.model_dump() for p in state.places], note="Cheapest to most expensive. These places are SIMULATED by the Python swarm service (no places API connected).")
        return
    place = next((p for p in state.places if p.id == state.placeId), None)
    if not place:
        yield card("places", places=[p.model_dump() for p in state.places], note="Pick a place.")
        return
    if not state.fulfilment:
        yield card("fulfilment", place=place.model_dump())
        return
    if state.fulfilment == "delivery" and not state.address:
        yield card("address")
        return
    if state.fulfilment == "delivery" and not state.delivery:
        yield card("connect_delivery", place=place.model_dump(), connectors=[ctx.connectors.get(c).describe() for c in ("doordash", "ubereats", "grubhub")])
        return

    connector = ctx.connectors.get(state.delivery or "pickup")
    f = ROUTER.dispatch(Frame("order", state.want, Track.COMMERCE, dict(state.answers), {"place": place.model_dump(), "address": state.address, "fulfilment": state.fulfilment, "delivery": state.delivery, "has_pin": ctx.pins.has(user_id), "connector_name": connector.name}))

    if not state.confirmed:
        if confirm and (not ctx.pins.has(user_id) or ctx.pins.check(user_id, pin)):
            state.confirmed = True
            yield {"type": "state", "state": state.model_dump(mode="json"), "label": "Order it"}
        else:
            if confirm:
                yield say("That PIN isn't right.")
            yield card("confirm_order", item=f.data["item"], place=place.model_dump(), fulfilment=state.fulfilment, address=state.address, delivery=state.delivery, confirmWith=f.data["confirm_with"], feeNote=f.data["fee_note"])
            return

    o = f.data["order"]
    order = Order(store=o["store"], items=o["items"], address=o["address"], fulfilment=o["fulfilment"])
    result = await connector.place_order(ctx.tokens.get(user_id, connector.id), order)
    if result.status == "placed":
        yield card("answer", markdown=f"**Ordered.** {result.message}", nextSteps=[], experts=[], verified=True)
        return
    # Not integrated / not connected: never a dead end. Palmo (desktop) does it on the person's screen, or they finish it.
    yield card("place_order", goal=f.data["palmo_goal"], link=result.link or connector.handoff_link(order) or "", service=connector.name, place=place.model_dump(), item=f.data["item"], connector=connector.describe(), note=result.message)
