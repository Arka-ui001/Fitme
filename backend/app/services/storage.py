"""Storage abstraction — local filesystem now, S3-compatible object storage later.

Storage keys (e.g. "photos/2026/09/ab12cd.png") are the ONLY identifiers the
API ever exposes. Raw filesystem paths never leave this module.
"""
from __future__ import annotations

import re
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings

KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9/._-]{0,300}$")


def validate_key(key: str) -> str:
    """Reject path traversal / weird keys before any storage access."""
    if not KEY_PATTERN.match(key) or ".." in key:
        from app.core.errors import NotFoundError
        raise NotFoundError("file_not_found", "No such file.")
    return key


class StorageBackend(ABC):
    @abstractmethod
    def save(self, content: bytes, key: str) -> str:
        """Persist bytes under `key`; return the key."""

    @abstractmethod
    def open(self, key: str) -> bytes:
        """Return file bytes for a validated key."""

    @abstractmethod
    def exists(self, key: str) -> bool: ...


class LocalStorage(StorageBackend):
    """Development storage rooted at settings.UPLOAD_DIR."""

    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or settings.UPLOAD_DIR).resolve()

    def _path(self, key: str) -> Path:
        validate_key(key)
        path = (self.root / key).resolve()
        # Defence in depth: never resolve outside the upload root.
        if not str(path).startswith(str(self.root)):
            from app.core.errors import NotFoundError
            raise NotFoundError("file_not_found", "No such file.")
        return path

    def save(self, content: bytes, key: str) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return key

    def open(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            from app.core.errors import NotFoundError
            raise NotFoundError("file_not_found", "No such file.")
        return path.read_bytes()

    def exists(self, key: str) -> bool:
        try:
            return self._path(key).is_file()
        except Exception:
            return False


class S3Storage(StorageBackend):
    """Placeholder for an S3-compatible backend (boto3 / minio).

    Implemented as a stub so the architecture is wired but no cloud
    dependency is required yet. Swap in via STORAGE_BACKEND=s3 after
    implementing `save/open/exists` with boto3.
    """

    def __init__(self, *_args, **_kwargs):
        raise NotImplementedError(
            "S3Storage is not implemented yet — use STORAGE_BACKEND=local. "
            "Implement app/services/storage.py:S3Storage with boto3 when ready."
        )

    def save(self, content: bytes, key: str) -> str:  # pragma: no cover
        raise NotImplementedError

    def open(self, key: str) -> bytes:  # pragma: no cover
        raise NotImplementedError

    def exists(self, key: str) -> bool:  # pragma: no cover
        raise NotImplementedError


def get_storage() -> StorageBackend:
    backend = settings.STORAGE_BACKEND.lower()
    if backend == "local":
        return LocalStorage()
    if backend == "s3":
        return S3Storage()
    raise ValueError(f"Unknown STORAGE_BACKEND: {settings.STORAGE_BACKEND!r}")
