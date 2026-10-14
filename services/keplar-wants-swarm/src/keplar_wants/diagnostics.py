"""Structured diagnostics for the swarm: one JSON object per line in `swarm_diagnostics.log`, plus in-process metrics.

Every line has `ts` (UTC ISO time), `event` and the fields for that event, so one bug can be isolated with a grep or `jq`:

    jq 'select(.event=="step_timeout")' swarm_diagnostics.log          # every hung expert step
    jq 'select(.expert_id==4108)' swarm_diagnostics.log                  # everything one micro-expert did
    jq 'select(.job_id=="…")' swarm_diagnostics.log                      # one request end to end

Events written by the registry and the pipeline:
    catalogue_populate   rows, seconds, rows_per_s
    profile_load         requested, cache_hits, loaded, ms            ("swap-in": rows paged in from SQLite)
    profile_load_failed  expert_id, error                             -> a baseline profile is used instead
    select               query_terms, k, ms, picked
    step_ok              job_id, expert_id, hook, ms, executor
    step_error           job_id, expert_id, error, fallback           -> the baseline model ran the step
    step_timeout         job_id, expert_id, timeout_s, routed_to      -> cancelled, the verification agent took over
    step_lost            job_id, expert_id, error                     -> even the fallback failed; recorded and skipped
    api_failure          target, error, status                        (model endpoint, connectors)
    job                  job_id, status, ms, steps, failed
    metrics              a snapshot of the counters (every METRICS_EVERY jobs and on shutdown)

The log rotates at 5 MB (3 backups). Its location is KEPLAR_WANTS_DIAG_LOG (default ./swarm_diagnostics.log). Prompts and
model outputs are NOT logged (they can contain personal data); only ids, timings, sizes and error types.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any

METRICS_EVERY = 25

_logger = logging.getLogger("keplar_wants.diagnostics")
_logger.propagate = False
_lock = threading.Lock()
_configured_path: str | None = None


def configure(path: str | None = None) -> str:
    """(Re)points the diagnostics log at `path`. Idempotent; returns the path in use."""
    global _configured_path
    target = path or os.environ.get("KEPLAR_WANTS_DIAG_LOG", "swarm_diagnostics.log")
    with _lock:
        if _configured_path == target and _logger.handlers:
            return target
        for h in list(_logger.handlers):
            _logger.removeHandler(h)
            h.close()
        handler = RotatingFileHandler(target, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(message)s"))
        _logger.addHandler(handler)
        _logger.setLevel(logging.INFO)
        _configured_path = target
    return target


class Metrics:
    """Counters and timings, thread-safe. `snapshot()` is what the metrics line and GET /v1/diagnostics show."""

    def __init__(self) -> None:
        self._c: Counter[str] = Counter()
        self._ms: dict[str, list[float]] = {}
        self._lock = threading.Lock()
        self.started = time.time()

    def inc(self, key: str, n: int = 1) -> None:
        with self._lock:
            self._c[key] += n

    def time(self, key: str, ms: float) -> None:
        with self._lock:
            xs = self._ms.setdefault(key, [])
            xs.append(ms)
            if len(xs) > 2000:
                del xs[:1000]

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            c = dict(self._c)
            timings = {k: {"n": len(v), "avg_ms": round(sum(v) / len(v), 2), "p95_ms": round(sorted(v)[int(len(v) * 0.95) - 1 if len(v) > 1 else 0], 2)} for k, v in self._ms.items() if v}
        hits, misses = c.get("cache_hit", 0), c.get("cache_miss", 0)
        steps = c.get("step_ok", 0) + c.get("step_error", 0) + c.get("step_timeout", 0) + c.get("step_lost", 0)
        return {
            "uptime_s": round(time.time() - self.started, 1),
            "counters": c,
            "cache_hit_rate": round(hits / (hits + misses), 3) if hits + misses else None,
            "step_success_rate": round(c.get("step_ok", 0) / steps, 3) if steps else None,
            "timings": timings,
        }

    def reset(self) -> None:
        with self._lock:
            self._c.clear()
            self._ms.clear()
            self.started = time.time()


METRICS = Metrics()


def log(event: str, **fields: Any) -> None:
    """Writes one diagnostics line. Never raises: diagnostics must not be able to break a user's request."""
    if not _logger.handlers:
        try:
            configure()
        except OSError:
            return
    try:
        _logger.info(json.dumps({"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "event": event, **fields}, default=str, ensure_ascii=False))
    except Exception:  # noqa: BLE001
        pass


def api_failure(target: str, error: BaseException | str, status: int | None = None) -> None:
    METRICS.inc("api_failure")
    log("api_failure", target=target, error=error if isinstance(error, str) else type(error).__name__, status=status)


def write_metrics() -> None:
    log("metrics", **METRICS.snapshot())
