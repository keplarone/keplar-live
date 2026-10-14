"""Everything a turn needs, built once at startup (app.py) and injected (tests build their own)."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .connectors import REGISTRY, ConnectorRegistry, StateSigner, TokenStore
from .registry_swarm import Catalogue, JobQueue, SwarmPipeline


class PinStore:
    """Optional purchase PINs, per user, stored as salted PBKDF2 hashes. A PIN is a confirmation step, not account security."""

    def __init__(self, path: str = ":memory:") -> None:
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS pins (user_id TEXT PRIMARY KEY, salt BLOB, hash BLOB)")

    @staticmethod
    def _hash(pin: str, salt: bytes) -> bytes:
        return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, 200_000)

    def set(self, user_id: str, pin: str) -> None:
        if not (pin.isdigit() and 4 <= len(pin) <= 6):
            raise ValueError("A PIN is 4–6 digits.")
        salt = secrets.token_bytes(16)
        self.db.execute("REPLACE INTO pins VALUES (?,?,?)", (user_id, salt, self._hash(pin, salt)))
        self.db.commit()

    def has(self, user_id: str) -> bool:
        return self.db.execute("SELECT 1 FROM pins WHERE user_id=?", (user_id,)).fetchone() is not None

    def check(self, user_id: str, pin: Optional[str]) -> bool:
        row = self.db.execute("SELECT salt, hash FROM pins WHERE user_id=?", (user_id,)).fetchone()
        return bool(row and pin) and hmac.compare_digest(self._hash(pin or "", row[0]), row[1])


@dataclass
class Context:
    catalogue: Catalogue
    queue: JobQueue
    workspace_root: Path
    connectors: ConnectorRegistry = field(default_factory=lambda: REGISTRY)
    tokens: TokenStore = field(default_factory=TokenStore)
    pins: PinStore = field(default_factory=PinStore)
    signer: StateSigner = field(default_factory=StateSigner)

    @classmethod
    def from_env(cls) -> "Context":
        data = Path(os.environ.get("KEPLAR_WANTS_DATA_DIR", "./data"))
        data.mkdir(parents=True, exist_ok=True)
        cat = Catalogue(str(data / "catalogue.sqlite"))
        cat.populate(int(os.environ.get("KEPLAR_WANTS_CATALOGUE_SIZE", "100000")))
        return cls(
            catalogue=cat,
            queue=JobQueue(SwarmPipeline(cat), workers=int(os.environ.get("KEPLAR_WANTS_WORKERS", "4"))),
            workspace_root=Path(os.environ.get("KEPLAR_WANTS_WORKSPACES", str(data / "workspaces"))),
            tokens=TokenStore(str(data / "tokens.sqlite")),
            pins=PinStore(str(data / "pins.sqlite")),
        )
