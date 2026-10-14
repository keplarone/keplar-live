"""Third-party connectors (DoorDash, Uber Eats, Grubhub, Airbnb, ...) behind one OAuth 2.0 handler interface.

"No out-of-scope errors": asking for a service Keplar has no integration for never raises "I can't do that". `get()` returns
a `PlaceholderConnector` generated on the spot: it has the same interface, says plainly that the service isn't connected
yet, and gives the tab a "connect" card. Nothing pretends to have ordered or booked.

HOW TO ADD A REAL INTEGRATION
-----------------------------
1. Subclass `OAuth2Connector` and set `id`, `name`, `authorize_endpoint`, `token_endpoint` and `scopes`, plus
   `client_id_env` / `client_secret_env` (the environment variables that hold the app's credentials, which you get by
   registering an app with the provider; consumer ordering APIs are partner-only at most providers, so you need that
   partnership first).
2. Implement `place_order(token, order)` (and any other calls) with `httpx.AsyncClient` against the provider's documented
   API. Return an `OrderResult`; never return status "placed" unless the provider confirmed it.
3. Register it: `REGISTRY.register(MyConnector())`. `status()` turns "available" as soon as its env vars are set.
4. Tokens: `TokenStore` keeps them per user in SQLite. In production, encrypt `access_token` / `refresh_token` at rest
   (e.g. with a KMS key) before storing; the store marks where.

The OAuth flow is standard authorization-code + PKCE (RFC 6749 / RFC 7636): `start()` makes the authorize URL with a signed
`state` and a code challenge; `finish()` checks the state, exchanges the code and stores the token.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional
from urllib.parse import quote, urlencode

import httpx

ConnStatus = Literal["available", "needs_credentials", "placeholder"]


@dataclass
class Order:
    store: str
    items: list[str]
    address: Optional[str]
    fulfilment: Literal["delivery", "pickup"]


@dataclass
class OrderResult:
    status: Literal["placed", "needs_connection", "handoff", "failed"]
    message: str
    link: Optional[str] = None
    provider_ref: Optional[str] = None


@dataclass
class TokenSet:
    access_token: str
    refresh_token: Optional[str] = None
    expires_at: float = 0.0
    scope: str = ""


class Connector(ABC):
    """What every connector offers. The engine only ever talks to this interface."""

    id: str
    name: str
    #: The OAuth scope `place_order` needs (checked by TokenValidator before the call).
    order_scope: str = "orders.write"

    @abstractmethod
    def status(self) -> ConnStatus: ...

    @abstractmethod
    def describe(self) -> dict[str, Any]:
        """A JSON-safe description for the tab's "connect" card."""

    @abstractmethod
    async def place_order(self, token: Optional[TokenSet], order: Order) -> OrderResult: ...

    def handoff_link(self, order: Order) -> Optional[str]:
        """A page where the person can finish the order themselves (signed in as themselves). Optional."""
        return None


@dataclass(frozen=True)
class TokenCheck:
    ok: bool
    reason: str


class TokenValidator:
    """The one gate in front of every logistics / purchase hook. A connector call that would change anything (an order, a
    booking) runs only when this says ok: the connector is a real integration (not a placeholder) with its credentials
    configured, a token is stored for this user and this connector, it isn't expired (with a 60 s margin), it has the
    scope the operation needs, and it is shaped like a bearer token (no whitespace or control characters, sane length).
    Anything else returns ok=False with the reason, and the caller hands the step to the person or Palmo instead."""

    MARGIN_S = 60.0

    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self.now = now

    def validate(self, connector: "Connector", token: Optional[TokenSet], scope: str) -> TokenCheck:
        if connector.status() == "placeholder":
            return TokenCheck(False, f"{connector.name} has no official integration yet.")
        if connector.status() != "available":
            return TokenCheck(False, f"{connector.name} isn't configured on this server.")
        if token is None:
            return TokenCheck(False, f"{connector.name} isn't connected for this account.")
        if not (16 <= len(token.access_token) <= 4096) or any(c.isspace() or ord(c) < 33 for c in token.access_token):
            return TokenCheck(False, "The stored token is malformed.")
        if token.expires_at and token.expires_at - self.MARGIN_S <= self.now():
            return TokenCheck(False, f"The {connector.name} sign-in expired. Connect again.")
        granted = set(token.scope.split()) if token.scope else set(getattr(connector, "scopes", ()))
        if scope and scope not in granted:
            return TokenCheck(False, f"{connector.name} wasn't given permission for {scope}.")
        return TokenCheck(True, "ok")


class TokenStore:
    """Per-user OAuth tokens in SQLite. PRODUCTION: encrypt the two token columns at rest before writing them."""

    def __init__(self, path: str = ":memory:") -> None:
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS tokens (user_id TEXT, connector TEXT, access_token TEXT, refresh_token TEXT, expires_at REAL, scope TEXT, PRIMARY KEY (user_id, connector))")

    def put(self, user_id: str, connector: str, t: TokenSet) -> None:
        self.db.execute("REPLACE INTO tokens VALUES (?,?,?,?,?,?)", (user_id, connector, t.access_token, t.refresh_token, t.expires_at, t.scope))
        self.db.commit()

    def get(self, user_id: str, connector: str) -> Optional[TokenSet]:
        row = self.db.execute("SELECT access_token, refresh_token, expires_at, scope FROM tokens WHERE user_id=? AND connector=?", (user_id, connector)).fetchone()
        return TokenSet(*row) if row else None

    def delete(self, user_id: str, connector: str) -> None:
        self.db.execute("DELETE FROM tokens WHERE user_id=? AND connector=?", (user_id, connector))
        self.db.commit()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class StateSigner:
    """Signs the OAuth `state` (user, connector, PKCE verifier, expiry) so the callback can trust it without server memory."""

    def __init__(self, secret: Optional[str] = None) -> None:
        self.key = (secret or os.environ.get("KEPLAR_WANTS_STATE_SECRET") or secrets.token_hex(32)).encode()

    def sign(self, payload: dict[str, Any]) -> str:
        body = _b64(json.dumps(payload, separators=(",", ":")).encode())
        mac = _b64(hmac.new(self.key, body.encode(), hashlib.sha256).digest())
        return f"{body}.{mac}"

    def verify(self, token: str) -> Optional[dict[str, Any]]:
        try:
            body, mac = token.split(".", 1)
        except ValueError:
            return None
        good = _b64(hmac.new(self.key, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(mac, good):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        return payload if payload.get("exp", 0) > time.time() else None


class OAuth2Connector(Connector):
    """Authorization-code + PKCE. Subclasses set the endpoints and implement the provider calls."""

    authorize_endpoint: str = ""
    token_endpoint: str = ""
    scopes: tuple[str, ...] = ()
    client_id_env: str = ""
    client_secret_env: str = ""
    handoff_url: str = ""

    def credentials(self) -> tuple[Optional[str], Optional[str]]:
        return os.environ.get(self.client_id_env), os.environ.get(self.client_secret_env)

    def status(self) -> ConnStatus:
        cid, sec = self.credentials()
        return "available" if cid and sec and self.authorize_endpoint and self.token_endpoint else "needs_credentials"

    def describe(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "status": self.status(), "auth": "oauth2", "scopes": list(self.scopes)}

    def start(self, user_id: str, redirect_uri: str, signer: StateSigner) -> str:
        """The URL to send the person's browser to. Raises RuntimeError when the app credentials aren't configured."""
        cid, _ = self.credentials()
        if self.status() != "available" or not cid:
            raise RuntimeError(f"{self.name} isn't configured on this server yet ({self.client_id_env} / {self.client_secret_env}).")
        verifier = _b64(secrets.token_bytes(32))
        challenge = _b64(hashlib.sha256(verifier.encode()).digest())
        state = signer.sign({"u": user_id, "c": self.id, "v": verifier, "exp": time.time() + 600})
        q = {"response_type": "code", "client_id": cid, "redirect_uri": redirect_uri, "scope": " ".join(self.scopes), "state": state, "code_challenge": challenge, "code_challenge_method": "S256"}
        return f"{self.authorize_endpoint}?{urlencode(q)}"

    async def finish(self, code: str, state: str, redirect_uri: str, signer: StateSigner, store: TokenStore, client: Optional[httpx.AsyncClient] = None) -> str:
        """Checks the state, exchanges the code, stores the token. Returns the user id. Raises ValueError on a bad state."""
        payload = signer.verify(state)
        if not payload or payload.get("c") != self.id:
            raise ValueError("The sign-in link expired or was changed. Start connecting again.")
        cid, sec = self.credentials()
        own = client is None
        client = client or httpx.AsyncClient(timeout=15)
        try:
            r = await client.post(self.token_endpoint, data={"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri, "client_id": cid, "client_secret": sec, "code_verifier": payload["v"]})
            r.raise_for_status()
            d = r.json()
        finally:
            if own:
                await client.aclose()
        store.put(payload["u"], self.id, TokenSet(d["access_token"], d.get("refresh_token"), time.time() + float(d.get("expires_in", 3600)), d.get("scope", "")))
        return str(payload["u"])

    async def place_order(self, token: Optional[TokenSet], order: Order) -> OrderResult:
        """Override with the provider's ordering call. The default hands the order to the person (never claims it was placed)."""
        link = self.handoff_link(order)
        if not token:
            return OrderResult("needs_connection", f"Connect {self.name} to order through your account.", link)
        return OrderResult("handoff", f"Keplar opened {order.store} on {self.name}; finish checkout there (or let Palmo do it on your screen).", link)


# ── delivery platforms ────────────────────────────────────────────────────────────────────────────────────────────────
# Consumer ordering on these platforms is partner-only: the endpoints below are left empty until Keplar has a partner app.
# Until then `status()` is "needs_credentials" and orders are handed off to the person's own signed-in app (or Palmo).


class DoorDashConnector(OAuth2Connector):
    id, name = "doordash", "DoorDash"
    client_id_env, client_secret_env = "DOORDASH_CLIENT_ID", "DOORDASH_CLIENT_SECRET"
    scopes = ("orders.write", "profile.read")

    def handoff_link(self, order: Order) -> str:
        return f"https://www.doordash.com/search/store/{quote(order.store, safe='')}/"


class UberEatsConnector(OAuth2Connector):
    id, name = "ubereats", "Uber Eats"
    client_id_env, client_secret_env = "UBEREATS_CLIENT_ID", "UBEREATS_CLIENT_SECRET"
    scopes = ("eats.order",)
    order_scope = "eats.order"

    def handoff_link(self, order: Order) -> str:
        return f"https://www.ubereats.com/search?{urlencode({'q': order.store})}"


class GrubhubConnector(OAuth2Connector):
    id, name = "grubhub", "Grubhub"
    client_id_env, client_secret_env = "GRUBHUB_CLIENT_ID", "GRUBHUB_CLIENT_SECRET"
    scopes = ("order",)
    order_scope = "order"

    def handoff_link(self, order: Order) -> str:
        return f"https://www.grubhub.com/search?{urlencode({'queryText': order.store})}"


@dataclass
class PlaceholderConnector(Connector):
    """Generated for any service Keplar doesn't integrate yet. Honest by construction: it never places anything."""

    id: str
    name: str
    hint_url: Optional[str] = None
    fields: dict[str, Any] = field(default_factory=dict)

    def status(self) -> ConnStatus:
        return "placeholder"

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "status": "placeholder",
            "auth": "oauth2",
            # The API structure a real integration would fill in (see the module docstring, "HOW TO ADD").
            "spec": {"authorize_endpoint": None, "token_endpoint": None, "scopes": [], "operations": ["search", "quote", "place_order", "cancel"], **self.fields},
            "how": f"{self.name} isn't integrated yet. Keplar can do it on your screen with Palmo (signed in as you), or open {self.name} for you to finish.",
        }

    async def place_order(self, token: Optional[TokenSet], order: Order) -> OrderResult:
        return OrderResult("handoff", f"{self.name} isn't integrated yet, so Keplar hands this step to Palmo or to you.", self.hint_url)

    def handoff_link(self, order: Order) -> Optional[str]:
        return self.hint_url


class ConnectorRegistry:
    def __init__(self) -> None:
        self._items: dict[str, Connector] = {}

    def register(self, c: Connector) -> None:
        self._items[c.id] = c

    def get(self, ident: str, *, hint_url: Optional[str] = None) -> Connector:
        """The connector for `ident`, or a generated placeholder (never an error)."""
        key = "".join(ch for ch in ident.lower() if ch.isalnum())[:40] or "service"
        found = self._items.get(key)
        if found:
            return found
        ph = PlaceholderConnector(id=key, name=ident.strip()[:60] or "This service", hint_url=hint_url)
        self._items[key] = ph
        return ph

    def all(self) -> list[dict[str, Any]]:
        return [c.describe() for c in self._items.values()]


VALIDATOR = TokenValidator()


async def place_order_validated(connector: Connector, token: Optional[TokenSet], order: Order, validator: TokenValidator = VALIDATOR) -> OrderResult:
    """The only way the engine places an order: validate first; a connector function runs only on a valid token.
    Errors from the provider are caught and logged, and become a hand-off, never an exception to the caller."""
    from . import diagnostics as diag

    check = validator.validate(connector, token, connector.order_scope)
    if not check.ok:
        return OrderResult("needs_connection" if connector.status() != "placeholder" else "handoff", check.reason, connector.handoff_link(order))
    try:
        return await connector.place_order(token, order)
    except Exception as e:  # noqa: BLE001
        diag.api_failure(f"connector:{connector.id}", e, getattr(getattr(e, "response", None), "status_code", None))
        return OrderResult("failed", f"{connector.name} didn't accept the order. Nothing was charged by Keplar; you can finish it there.", connector.handoff_link(order))


REGISTRY = ConnectorRegistry()
for _c in (DoorDashConnector(), UberEatsConnector(), GrubhubConnector()):
    REGISTRY.register(_c)
