"""Upload validation — extension, MIME and magic-byte sniffing, size caps.

Rules (spec §17):
- allowlist extensions per kind (photo/video)
- verify declared MIME + actual file signature agree
- enforce size limits; read once, bounded
- NEVER use the client filename for storage (uuid4 hex keys)
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings
from app.core.errors import UploadError
from app.schemas.analysis import (
    ALLOWED_PHOTO_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS,
)

# Magic-byte signatures
def _sniff(head: bytes) -> str | None:
    """Return detected family: 'photo' | 'video' | None."""
    if head[:3] == b"\xff\xd8\xff":
        return "photo"                                        # JPEG
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "photo"                                        # PNG
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "photo"                                        # WEBP
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return "video"                                        # MP4 / MOV (ISO BMFF brands)
    return None


@dataclass
class ValidatedUpload:
    content: bytes
    extension: str
    mime_type: str
    size_bytes: int


class UploadService:
    def __init__(self, storage=None):
        self._storage = storage  # injected lazily to keep import cycles out

    def validate(self, *, filename: str | None, content_type: str | None,
                 payload: bytes, kind: str) -> ValidatedUpload:
        kind = kind.lower()
        if kind not in ("photo", "video"):
            raise UploadError("invalid_kind", "Kind must be 'photo' or 'video'.")

        max_mb = settings.MAX_PHOTO_MB if kind == "photo" else settings.MAX_VIDEO_MB
        if len(payload) == 0:
            raise UploadError("empty_file", "The uploaded file is empty.")
        if len(payload) > max_mb * 1024 * 1024:
            raise UploadError("file_too_large", f"File exceeds the {max_mb} MB limit for {kind}s.")

        ext = Path(filename or "").suffix.lower().lstrip(".")
        allowed_ext = ALLOWED_PHOTO_EXTENSIONS if kind == "photo" else ALLOWED_VIDEO_EXTENSIONS
        if ext not in allowed_ext:
            raise UploadError(
                "bad_extension",
                f"Allowed {kind} extensions: {', '.join(sorted(allowed_ext))}. Got '{ext or 'none'}'.")

        mime = (content_type or "").split(";")[0].strip().lower()
        allowed_mime = ({"image/jpeg", "image/png", "image/webp"} if kind == "photo"
                        else {"video/mp4", "video/quicktime", "application/octet-stream"})
        if mime and mime not in allowed_mime:
            raise UploadError("bad_mime", f"Content-Type '{mime}' is not an accepted {kind} type.")

        family = _sniff(payload[:16])
        if family != kind:
            raise UploadError(
                "content_mismatch",
                "File contents do not look like a valid "
                f"{'image (JPG/PNG/WEBP)' if kind == 'photo' else 'video (MP4/MOV)'}.",
            )
        return ValidatedUpload(content=payload, extension=ext, mime_type=mime or "application/octet-stream",
                               size_bytes=len(payload))

    def storage_key(self, kind: str, ext: str) -> str:
        """photos/2026/09/<uuid>.png — unique, unguessable, no client input."""
        now = datetime.now(timezone.utc)
        return f"{kind}s/{now:%Y/%m}/{uuid.uuid4().hex}.{ext}"
