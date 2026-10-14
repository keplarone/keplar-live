"""Security gate for everything the swarm does to the machine it runs on.

Two layers, and every automated file write or tool action goes through them:

* `ContainedWriter` writes generated source files ONLY inside one workspace directory. It refuses absolute paths, `..`
  segments, drive letters, NUL bytes, symlinks anywhere on the way, hidden/system names, unknown file types, oversized files
  and too many files, and it resolves the final path and checks it is still inside the root (defence in depth: the string
  checks catch the obvious cases, `resolve()` + `is_relative_to` catches the rest, including symlinked parents).
  It writes with plain file I/O, never a shell or `subprocess`, so a file name can never become a command.
* `ActionGate` allows only the action kinds the swarm is meant to take, checks their path arguments with the same
  containment rule, and refuses anything else with a reason (shown to the person, never silently dropped).
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

ALLOWED_SUFFIXES = frozenset({
    ".html", ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".txt", ".py", ".lua", ".luau", ".toml", ".yml",
    ".yaml", ".svg", ".env.example", ".gitignore",
})
MAX_FILE_BYTES = 512 * 1024
MAX_FILES = 200
MAX_TOTAL_BYTES = 8 * 1024 * 1024
_SEGMENT = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\-]{0,100}$")


class ContainmentError(ValueError):
    """A path or action that would leave the workspace, or isn't allowed at all."""


def _suffix_ok(name: str) -> bool:
    return name in {".gitignore"} or any(name.endswith(s) for s in ALLOWED_SUFFIXES)


def safe_relative(rel: str) -> PurePosixPath:
    """Validates a workspace-relative path string and returns it normalised. Raises ContainmentError."""
    if not isinstance(rel, str) or not rel or len(rel) > 300:
        raise ContainmentError("Empty or overlong path.")
    if "\x00" in rel or "\\" in rel:
        raise ContainmentError("Backslashes and NUL bytes are not allowed in paths.")
    if rel.startswith("/") or re.match(r"^[A-Za-z]:", rel):
        raise ContainmentError("Absolute paths are not allowed.")
    parts = PurePosixPath(rel).parts
    if not parts:
        raise ContainmentError("Empty path.")
    for seg in parts:
        if seg in ("..", ".") or not (_SEGMENT.match(seg) or seg == ".gitignore"):
            raise ContainmentError(f"Path segment not allowed: {seg!r}")
    if not _suffix_ok(parts[-1]):
        raise ContainmentError(f"File type not allowed: {parts[-1]!r}")
    return PurePosixPath(*parts)


@dataclass
class ContainedWriter:
    """Writes files inside `root` only. Create one per workspace; `root` is created if missing."""

    root: Path
    written: list[tuple[str, int]] = field(default_factory=list)
    _total: int = 0

    def __post_init__(self) -> None:
        self.root = Path(self.root)
        self.root.mkdir(parents=True, exist_ok=True)
        if self.root.is_symlink():
            raise ContainmentError("The workspace root must not be a symlink.")
        self.root = self.root.resolve(strict=True)

    def target(self, rel: str) -> Path:
        """The absolute path for `rel`, proven to be inside the root."""
        clean = safe_relative(rel)
        path = self.root.joinpath(*clean.parts)
        # No symlink may sit anywhere between the root and the file (it could point outside).
        probe = self.root
        for seg in clean.parts:
            probe = probe / seg
            if probe.is_symlink():
                raise ContainmentError(f"Refusing to write through a symlink: {seg!r}")
        resolved = path.resolve(strict=False)
        if not resolved.is_relative_to(self.root):
            raise ContainmentError("Path escapes the workspace.")
        return resolved

    def write(self, rel: str, content: str) -> Path:
        data = content.encode("utf-8")
        if len(data) > MAX_FILE_BYTES:
            raise ContainmentError(f"{rel} is larger than {MAX_FILE_BYTES} bytes.")
        if len(self.written) >= MAX_FILES:
            raise ContainmentError(f"More than {MAX_FILES} files.")
        if self._total + len(data) > MAX_TOTAL_BYTES:
            raise ContainmentError("The workspace size limit was reached.")
        path = self.target(rel)
        # Written to a temp file in the same folder, then renamed into place: a failure part-way never leaves a
        # half-written file, and the descriptor is always closed. OSErrors become ContainmentError with the reason.
        tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        fd: int | None = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            # O_NOFOLLOW / O_EXCL: a symlink planted after the check (a race) makes the open fail instead of being followed.
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
            fd = os.open(tmp, flags, 0o644)
            view = memoryview(data)
            while view:
                n = os.write(fd, view)
                view = view[n:]
            os.fsync(fd)
            os.close(fd)
            fd = None
            os.replace(tmp, path)
        except OSError as e:
            raise ContainmentError(f"Couldn't write {rel}: {e.strerror or type(e).__name__}") from e
        finally:
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
        self._total += len(data)
        self.written.append((str(safe_relative(rel)), len(data)))
        return path

    def write_all(self, files: Iterable[tuple[str, str]]) -> list[tuple[str, int]]:
        """Validates EVERY path first, then writes. A bad path means nothing is written; a write that fails part-way
        removes the files this call already wrote (all or nothing), then raises ContainmentError."""
        files = list(files)
        for rel, _ in files:
            self.target(rel)
        before = len(self.written)
        done: list[Path] = []
        try:
            for rel, content in files:
                done.append(self.write(rel, content))
        except Exception:
            for p in done:
                try:
                    p.unlink()
                except OSError:
                    pass
            del self.written[before:]
            self._total = sum(b for _, b in self.written)
            raise
        return list(self.written)


ALLOWED_ACTIONS = frozenset({"write_file", "read_file", "list_dir", "open_url", "palmo_task", "connector_call"})


@dataclass
class ActionGate:
    """The one door every automated tool action goes through. Extend ALLOWED_ACTIONS deliberately, with a check here."""

    writer: ContainedWriter

    def check(self, action: dict[str, Any]) -> dict[str, Any]:
        kind = action.get("kind")
        if kind not in ALLOWED_ACTIONS:
            raise ContainmentError(f"Action not allowed: {kind!r}")
        if kind in ("write_file", "read_file", "list_dir"):
            rel = str(action.get("path", ""))
            if kind == "list_dir" and rel in ("", "."):
                return action
            if kind == "list_dir":
                # Directories have no suffix: validate the segments only.
                for seg in PurePosixPath(rel).parts:
                    if seg in ("..", ".") or not _SEGMENT.match(seg):
                        raise ContainmentError(f"Path segment not allowed: {seg!r}")
            else:
                self.writer.target(rel)
        if kind == "open_url":
            url = str(action.get("url", ""))
            if not re.match(r"^https://[A-Za-z0-9.\-]+(:\d+)?(/[^\s]*)?$", url):
                raise ContainmentError("Only https:// addresses can be opened.")
        if kind == "palmo_task":
            goal = str(action.get("goal", ""))
            if not (4 <= len(goal) <= 600):
                raise ContainmentError("A Palmo task needs a goal of 4–600 characters.")
        return action
