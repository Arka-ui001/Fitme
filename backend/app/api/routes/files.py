"""File serving — exposes uploads ONLY via validated storage keys.
No filesystem paths ever appear in API responses (spec §17)."""
from __future__ import annotations

import mimetypes

from fastapi import APIRouter, Depends, Response

from app.api.deps import get_current_user
from app.models.user import User
from app.services.storage import get_storage

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{file_key:path}")
def serve_file(file_key: str,
               current_user: User = Depends(get_current_user)):
    storage = get_storage()
    content = storage.open(file_key)  # validates the key and 404s safely
    mime, _ = mimetypes.guess_type(file_key)
    return Response(content=content, media_type=mime or "application/octet-stream",
                    headers={"Cache-Control": "private, max-age=3600"})
