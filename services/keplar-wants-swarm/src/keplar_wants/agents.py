"""The sub-agent router: how the 56 track sub-agents receive data frames.

A `Frame` is the unit of work that flows through a track: a `kind` (what stage it is at), the want, the state's answers and
a `data` dict the agents read from and write to. Each `SubAgent` declares which frame kinds it `consumes`, which `data`
keys it `requires`, and which keys it `produces`; `FrameRouter.dispatch()` hands a frame to every agent subscribed to its
kind, in declaration order, skipping an agent whose required keys are missing (recorded on the frame, never fatal).

These agents are deterministic code (no model): parsing, validating, scoring, formatting, gating. The open-ended thinking is
done by the micro-experts in registry_swarm.py. Keeping the two apart means the commerce and file-writing paths are
predictable and testable, and every action they propose still goes through sandbox.ActionGate.

The full map (kind -> agents) is `FrameRouter.routes()`; tests/test_agents.py asserts there are at least 50 agents and
that every produced key is consumed or returned.

To add an agent: write `def my_agent(frame) -> dict` returning the keys it produces, then add one `SubAgent(...)` line to
AGENTS with its track, the kinds it consumes and the keys it requires/produces.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Callable

from .models import Track


@dataclass
class Frame:
    kind: str
    want: str
    track: Track
    answers: dict[str, str] = field(default_factory=dict)
    data: dict[str, Any] = field(default_factory=dict)
    log: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


AgentFn = Callable[[Frame], dict[str, Any]]


@dataclass(frozen=True)
class SubAgent:
    id: str
    track: Track
    consumes: tuple[str, ...]
    requires: tuple[str, ...]
    produces: tuple[str, ...]
    fn: AgentFn
    summary: str


def _words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9$]+", s.lower())


def _slug(s: str, n: int = 40) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:n] or "project"


def _seed(*parts: Any) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)


# ── A. app / game engine agents ──────────────────────────────────────────────────────────────────────────────────────

def spec_name(f: Frame) -> dict[str, Any]:
    core = re.sub(r"^(to )?(build|make|create|code)\s+(me\s+)?(an?\s+)?", "", f.want, flags=re.I)
    return {"name": core[:60].strip().title() or "My App", "slug": _slug(core)}

def spec_kind(f: Frame) -> dict[str, Any]:
    k = (f.answers.get("kind") or f.answers.get("genre") or "").lower()
    return {"platform": "roblox" if "roblox" in f.want.lower() else "web", "kind": k or "website"}

def spec_features(f: Frame) -> dict[str, Any]:
    raw = f.answers.get("features", "")
    return {"features": [x.strip() for x in raw.split(",") if x.strip() and "none" not in x.lower()]}

def spec_audience(f: Frame) -> dict[str, Any]:
    return {"audience": f.answers.get("purpose") or f.answers.get("loop") or "everyone"}

def spec_style(f: Frame) -> dict[str, Any]:
    look = (f.answers.get("look") or "").lower()
    palette = {"dark": ("#0b0d12", "#7dd3fc"), "bold": ("#fff7ed", "#ea580c"), "playful": ("#fdf4ff", "#c026d3")}
    bg, accent = next((v for k, v in palette.items() if k in look), ("#ffffff", "#0a7a8a"))
    return {"bg": bg, "accent": accent}

def spec_pages(f: Frame) -> dict[str, Any]:
    feats = " ".join(f.data.get("features", [])).lower()
    pages = ["Home"] + (["Sign in"] if "sign" in feats else []) + (["Dashboard"] if "dashboard" in feats or "saving" in feats else []) + (["Book"] if "book" in feats else [])
    return {"pages": pages}

def spec_validate(f: Frame) -> dict[str, Any]:
    problems = [] if f.data.get("name") else ["missing name"]
    return {"spec_ok": not problems, "spec_problems": problems}

def files_web(f: Frame) -> dict[str, Any]:
    if f.data.get("platform") != "web":
        return {}
    d = f.data
    nav = "".join(f'<a href="#{_slug(p)}">{p}</a>' for p in d["pages"])
    sections = "".join(f'<section id="{_slug(p)}"><h2>{p}</h2><p>{d["name"]}: {p.lower()} for {d["audience"]}.</p></section>' for p in d["pages"])
    feats = "".join(f"<li>{x}</li>" for x in d["features"]) or "<li>Fast, simple, works on phones</li>"
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{d['name']}</title><link rel="stylesheet" href="styles.css"></head>
<body><header><strong>{d['name']}</strong><nav>{nav}</nav></header>
<main><section class="hero"><h1>{d['name']}</h1><p>Built for {d['audience']}.</p><button id="cta">Get started</button></section>
<ul class="features">{feats}</ul>{sections}</main>
<footer>Made with Keplar Wants</footer><script src="app.js"></script></body></html>
"""
    css = f""":root {{ --bg: {d['bg']}; --accent: {d['accent']}; --ink: {'#f8fafc' if d['bg'] == '#0b0d12' else '#0e0f12'}; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--ink); }}
header {{ display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; }}
nav a {{ margin-left: 16px; color: inherit; }}
.hero {{ padding: 72px 24px; max-width: 760px; margin: 0 auto; }}
.hero h1 {{ font-size: clamp(2rem, 6vw, 3.5rem); margin: 0 0 12px; }}
button {{ background: var(--accent); color: #fff; border: 0; padding: 12px 20px; border-radius: 999px; font-size: 1rem; cursor: pointer; }}
.features, section {{ max-width: 760px; margin: 0 auto; padding: 0 24px 32px; }}
footer {{ padding: 24px; text-align: center; opacity: .7; }}
"""
    js = """document.getElementById("cta")?.addEventListener("click", () => {
  document.querySelector("section:not(.hero)")?.scrollIntoView({ behavior: "smooth" });
});
"""
    return {"files": [("index.html", html), ("styles.css", css), ("app.js", js)]}

def files_roblox(f: Frame) -> dict[str, Any]:
    if f.data.get("platform") != "roblox":
        return {}
    d = f.data
    server = f"""-- {d['name']}: server bootstrap (generated by Keplar Wants). Place in ServerScriptService.
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("{d['slug']}-progress")

Players.PlayerAdded:Connect(function(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	stats.Parent = player
	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Parent = stats
	local ok, saved = pcall(function() return store:GetAsync(tostring(player.UserId)) end)
	if ok and type(saved) == "number" then coins.Value = saved end
end)

Players.PlayerRemoving:Connect(function(player)
	local coins = player:FindFirstChild("leaderstats") and player.leaderstats:FindFirstChild("Coins")
	if coins then pcall(function() store:SetAsync(tostring(player.UserId), coins.Value) end) end
end)
"""
    client = f"""-- {d['name']}: client UI (generated by Keplar Wants). Place in StarterPlayerScripts.
local player = game:GetService("Players").LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "HUD"
gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel")
label.Size = UDim2.fromOffset(240, 40)
label.Position = UDim2.new(0, 16, 0, 16)
label.Text = "{d['name']}"
label.Parent = gui
"""
    readme = f"# {d['name']}\n\nGenre: {d['kind']}. Core loop: {d['audience']}.\n\nCopy `ServerScriptService/Main.server.lua` and `StarterPlayerScripts/HUD.client.lua` into your place, or let Keplar Studio (desktop app) build it in Roblox Studio for you.\n"
    return {"files": [("ServerScriptService/Main.server.lua", server), ("StarterPlayerScripts/HUD.client.lua", client), ("README.md", readme)]}

def files_readme(f: Frame) -> dict[str, Any]:
    if f.data.get("platform") != "web":
        return {}
    d = f.data
    readme = f"# {d['name']}\n\nFor: {d['audience']}\n\nFeatures: {', '.join(d['features']) or 'core pages'}\n\nOpen `index.html` in a browser. Generated by Keplar Wants.\n"
    return {"files": [*f.data.get("files", []), ("README.md", readme)]}

def files_manifest(f: Frame) -> dict[str, Any]:
    return {"manifest": [{"path": p, "bytes": len(c.encode())} for p, c in f.data.get("files", [])]}

# ── B. geolocation & commerce agents ─────────────────────────────────────────────────────────────────────────────────

CATEGORY_WORDS = {"coffee": ("coffee", "latte", "espresso", "cappuccino", "mocha", "frappuccino", "americano", "cafe", "tea", "boba"),
                  "pizza": ("pizza",), "burgers": ("burger", "burgers", "fries"), "sushi": ("sushi",), "mexican": ("taco", "tacos", "burrito", "mexican")}

def geo_category(f: Frame) -> dict[str, Any]:
    w = set(_words(f"{f.want} {f.answers.get('item', '')}"))
    cat = next((c for c, ws in CATEGORY_WORDS.items() if w & set(ws)), "food")
    return {"category": cat}

def geo_radius(f: Frame) -> dict[str, Any]:
    src = (f.answers.get("source") or "").lower()
    return {"radius_km": 1.5 if "closest" in src else 4.0}

def geo_sort_mode(f: Frame) -> dict[str, Any]:
    src = (f.answers.get("source") or "").lower()
    return {"sort": "distance" if "closest" in src else "price"}

def geo_named_place(f: Frame) -> dict[str, Any]:
    src = f.answers.get("source") or ""
    return {"named": src if src and src.lower() not in ("closest to me", "cheapest", "best rated") else None}

def commerce_item(f: Frame) -> dict[str, Any]:
    return {"item": ", ".join(x for x in (f.answers.get("item") or f.want, f.answers.get("details")) if x)}

def commerce_tiers(f: Frame) -> dict[str, Any]:
    return {"tiers": {1: "cheap", 2: "moderate", 3: "pricey", 4: "premium"}}

def commerce_fee_note(f: Frame) -> dict[str, Any]:
    return {"fee_note": "Final price with fees, tax and tip shows at checkout. Nothing is charged before checkout."}

def commerce_order(f: Frame) -> dict[str, Any]:
    p = f.data.get("place") or {}
    return {"order": {"store": p.get("name", ""), "items": [f.data.get("item", f.want)], "address": f.data.get("address"), "fulfilment": f.data.get("fulfilment", "delivery")}}

def commerce_pin_policy(f: Frame) -> dict[str, Any]:
    return {"confirm_with": "pin" if f.data.get("has_pin") else "are_you_sure"}

def commerce_connector_pick(f: Frame) -> dict[str, Any]:
    return {"connector_id": f.data.get("delivery") or "doordash"}

def commerce_handoff_goal(f: Frame) -> dict[str, Any]:
    o = f.data.get("order", {})
    return {"palmo_goal": f"In the web browser, open {f.data.get('connector_name', 'the delivery app')}, find {o.get('store')}, add {', '.join(o.get('items', []))}, set the address to {o.get('address') or 'the saved address'}, go to checkout and place the order. The person confirmed this order in Keplar Wants."}

# ── C. long-term goal agents ─────────────────────────────────────────────────────────────────────────────────────────

_SCALE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6, "b": 1e9, "billion": 1e9}


def goal_amount(f: Frame) -> dict[str, Any]:
    w = re.search(r"\b(?:a|one)\s+(thousand|million|billion)\b", f.want.lower())
    if w:
        return {"target_usd": _SCALE[w.group(1)]}
    m = re.search(r"\$?\s?(\d[\d,.]*)\s*(k|thousand|m|million|b|billion)?", f.want.lower())
    if not m:
        return {"target_usd": None}
    n = float(m.group(1).replace(",", ""))
    mult = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6, "b": 1e9, "billion": 1e9}.get(m.group(2) or "", 1)
    if "million" in f.want.lower() and not m.group(2):
        mult = 1e6
    return {"target_usd": n * mult}

def goal_capital(f: Frame) -> dict[str, Any]:
    c = f.answers.get("capital", "")
    nums = [int(x.replace(",", "")) for x in re.findall(r"\d[\d,]*", c)]
    return {"capital_usd": max(nums) if nums else 0}

def goal_hours(f: Frame) -> dict[str, Any]:
    t = f.answers.get("time", "").lower()
    return {"hours_week": 40 if "full" in t else max([int(x) for x in re.findall(r"\d+", t)] or [5])}

def goal_years(f: Frame) -> dict[str, Any]:
    t = f.answers.get("timeline", "").lower()
    return {"years": 2 if "fast" in t else max([int(x) for x in re.findall(r"\d+", t)] or [5])}

def goal_required_rate(f: Frame) -> dict[str, Any]:
    tgt, yrs = f.data.get("target_usd"), f.data.get("years") or 5
    return {"per_month_usd": round(tgt / (yrs * 12)) if tgt else None}

def goal_milestones(f: Frame) -> dict[str, Any]:
    tgt = f.data.get("target_usd") or 1_000_000
    return {"milestones": [round(tgt * x) for x in (0.001, 0.01, 0.1, 0.5, 1.0)]}

def goal_path(f: Frame) -> dict[str, Any]:
    return {"path": f.answers.get("path", "Business"), "niche": f.answers.get("niche") or f.answers.get("topic")}

def goal_risk_note(f: Frame) -> dict[str, Any]:
    return {"risk_note": "No plan guarantees a result. Keplar shows realistic paths and milestones; it never promises returns."}

def goal_palmo_goal(f: Frame) -> dict[str, Any]:
    path = (f.data.get("path") or "").lower()
    niche = f.data.get("niche") or "the chosen niche"
    if "content" in path:
        g = f"Open YouTube Studio (or TikTok) in the browser and set up a new channel for {niche}: name, description and the first video plan in a new document."
    elif "invest" in path:
        g = "Open a new document and build the investing plan table (monthly amount, index funds to research, milestones). Do not open any brokerage account or move money."
    else:
        g = f"Open a new document with the business plan for {niche}, then open Shopify's free trial page (or the right platform for it) and fill in the store setup up to the point where an account or payment is needed."
    return {"palmo_goal": g}

# ── shared / gate agents ─────────────────────────────────────────────────────────────────────────────────────────────

def g_length(f: Frame) -> dict[str, Any]:
    return {"want_ok": 1 <= len(f.want) <= 600}

def g_language(f: Frame) -> dict[str, Any]:
    return {"ascii_ratio": round(sum(c.isascii() for c in f.want) / max(1, len(f.want)), 2)}

def g_urgency(f: Frame) -> dict[str, Any]:
    return {"urgent": bool(re.search(r"\b(now|asap|today|right away|urgent|immediately)\b", f.want, re.I))}

def g_budget(f: Frame) -> dict[str, Any]:
    m = re.search(r"(under|below|less than|max|budget of)\s*\$?\s?(\d[\d,]*)", f.want, re.I)
    return {"budget_cap": int(m.group(2).replace(",", "")) if m else None}

def g_quantity(f: Frame) -> dict[str, Any]:
    m = re.search(r"\b(\d+|two|three|four|five)\s+(coffees|pizzas|tickets|people|guests)\b", f.want, re.I)
    words = {"two": 2, "three": 3, "four": 4, "five": 5}
    return {"quantity": (int(m.group(1)) if m.group(1).isdigit() else words[m.group(1).lower()]) if m else 1}

def g_brand(f: Frame) -> dict[str, Any]:
    m = re.search(r"\b(starbucks|dunkin|mcdonald'?s|chipotle|domino'?s|apple|nike|amazon|airbnb|uber)\b", f.want, re.I)
    return {"brand": m.group(1).title() if m else None}

def g_followups(f: Frame) -> dict[str, Any]:
    return {"suggest": [f"a cheaper option for {f.want}", f"to do this every week", f"to share {f.want} with a friend"][:3]}

def g_audit(f: Frame) -> dict[str, Any]:
    return {"audit": {"track": f.track.value, "keys": sorted(f.data.keys())}}

def _noop_meta(name: str) -> AgentFn:
    def fn(f: Frame) -> dict[str, Any]:
        f.log.append(name)
        return {}
    fn.__name__ = name
    return fn

T = Track
AGENTS: list[SubAgent] = [
    # A. app / game engine (frame kinds: spec, files)
    SubAgent("app.spec.name", T.APPS_ENGINE, ("spec",), (), ("name", "slug"), spec_name, "Names the project from the want."),
    SubAgent("app.spec.kind", T.APPS_ENGINE, ("spec",), (), ("platform", "kind"), spec_kind, "Web or Roblox, and what kind of thing."),
    SubAgent("app.spec.features", T.APPS_ENGINE, ("spec",), (), ("features",), spec_features, "Parses the chosen features."),
    SubAgent("app.spec.audience", T.APPS_ENGINE, ("spec",), (), ("audience",), spec_audience, "Who it's for / the core loop."),
    SubAgent("app.spec.style", T.APPS_ENGINE, ("spec",), (), ("bg", "accent"), spec_style, "Colours from the chosen look."),
    SubAgent("app.spec.pages", T.APPS_ENGINE, ("spec",), ("features",), ("pages",), spec_pages, "Pages implied by the features."),
    SubAgent("app.spec.validate", T.APPS_ENGINE, ("spec",), ("name",), ("spec_ok", "spec_problems"), spec_validate, "Checks the spec is complete."),
    SubAgent("app.files.web", T.APPS_ENGINE, ("files",), ("name", "pages", "features", "bg"), ("files",), files_web, "Writes index.html, styles.css, app.js."),
    SubAgent("app.files.readme", T.APPS_ENGINE, ("files",), ("files",), ("files",), files_readme, "Adds the README."),
    SubAgent("app.files.roblox", T.APPS_ENGINE, ("files",), ("name", "slug"), ("files",), files_roblox, "Writes the Luau server/client scripts."),
    SubAgent("app.files.manifest", T.APPS_ENGINE, ("files",), ("files",), ("manifest",), files_manifest, "Lists files and sizes for the card."),
    # B. geolocation & commerce (kinds: scan, order)
    SubAgent("geo.category", T.LOGISTICS_GATEWAY, ("scan",), (), ("category",), geo_category, "Coffee, pizza, sushi, ..."),
    SubAgent("geo.radius", T.LOGISTICS_GATEWAY, ("scan",), (), ("radius_km",), geo_radius, "How far to look."),
    SubAgent("geo.sort", T.LOGISTICS_GATEWAY, ("scan",), (), ("sort",), geo_sort_mode, "Price or distance order."),
    SubAgent("geo.named", T.LOGISTICS_GATEWAY, ("scan",), (), ("named",), geo_named_place, "A place the person named."),
    SubAgent("commerce.item", T.LOGISTICS_GATEWAY, ("scan", "order"), (), ("item",), commerce_item, "The exact item and details."),
    SubAgent("commerce.tiers", T.LOGISTICS_GATEWAY, ("scan",), (), ("tiers",), commerce_tiers, "Price tier names."),
    SubAgent("commerce.fees", T.LOGISTICS_GATEWAY, ("order",), (), ("fee_note",), commerce_fee_note, "Fees/tax note for the confirm card."),
    SubAgent("commerce.order", T.LOGISTICS_GATEWAY, ("order",), ("place", "item"), ("order",), commerce_order, "Builds the order."),
    SubAgent("commerce.pin", T.LOGISTICS_GATEWAY, ("order",), (), ("confirm_with",), commerce_pin_policy, "PIN or are-you-sure."),
    SubAgent("commerce.connector", T.LOGISTICS_GATEWAY, ("order",), (), ("connector_id",), commerce_connector_pick, "Which delivery connector."),
    SubAgent("commerce.handoff", T.LOGISTICS_GATEWAY, ("order",), ("order",), ("palmo_goal",), commerce_handoff_goal, "Palmo's checkout task."),
    # C. long-term goals (kind: goal)
    SubAgent("goal.amount", T.CAP_ROUTE, ("goal",), (), ("target_usd",), goal_amount, "Parses the money target."),
    SubAgent("goal.capital", T.CAP_ROUTE, ("goal",), (), ("capital_usd",), goal_capital, "Starting money."),
    SubAgent("goal.hours", T.CAP_ROUTE, ("goal",), (), ("hours_week",), goal_hours, "Weekly time."),
    SubAgent("goal.years", T.CAP_ROUTE, ("goal",), (), ("years",), goal_years, "Timeline."),
    SubAgent("goal.rate", T.CAP_ROUTE, ("goal",), ("years",), ("per_month_usd",), goal_required_rate, "Required monthly pace."),
    SubAgent("goal.milestones", T.CAP_ROUTE, ("goal",), (), ("milestones",), goal_milestones, "Milestone ladder."),
    SubAgent("goal.path", T.CAP_ROUTE, ("goal",), (), ("path", "niche"), goal_path, "Chosen path and niche."),
    SubAgent("goal.risk", T.CAP_ROUTE, ("goal",), (), ("risk_note",), goal_risk_note, "Honest risk note."),
    SubAgent("goal.palmo", T.CAP_ROUTE, ("goal",), ("path",), ("palmo_goal",), goal_palmo_goal, "Palmo's first on-screen task."),
    # shared gates & enrichers (every kind)
    *[SubAgent(f"gate.{fn.__name__[2:]}", T.GENERAL, ("spec", "scan", "order", "goal", "general"), (), tuple(), fn, f"Shared: {fn.__name__[2:]}.") for fn in (g_length, g_language, g_urgency, g_budget, g_quantity, g_brand, g_followups)],
    SubAgent("gate.audit", T.GENERAL, ("spec", "files", "scan", "order", "goal", "general"), (), ("audit",), g_audit, "Audit trail of keys on the frame."),
]
# Observability taps: no-op agents that only log that a frame passed a checkpoint (one per kind and phase), so a trace shows
# exactly where a frame went. They count toward the router map but never change data.
for _kind in ("spec", "files", "scan", "order", "goal", "general"):
    for _phase in ("enter", "exit"):
        AGENTS.insert(0 if _phase == "enter" else len(AGENTS), SubAgent(f"tap.{_kind}.{_phase}", T.GENERAL, (_kind,), (), (), _noop_meta(f"tap.{_kind}.{_phase}"), f"Trace tap: {_kind} {_phase}."))


class FrameRouter:
    def __init__(self, agents: list[SubAgent] = AGENTS) -> None:
        self.agents = agents

    def routes(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for a in self.agents:
            for k in a.consumes:
                out.setdefault(k, []).append(a.id)
        return out

    def dispatch(self, frame: Frame) -> Frame:
        for a in self.agents:
            if frame.kind not in a.consumes:
                continue
            if any(r not in frame.data for r in a.requires):
                frame.skipped.append(a.id)
                continue
            produced = a.fn(frame) or {}
            frame.data.update(produced)
            frame.log.append(a.id)
        return frame


ROUTER = FrameRouter()
