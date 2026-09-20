"""Upload validation: extension, MIME, magic bytes, size, key hygiene."""
import pytest

from app.core.errors import UploadError
from app.services.upload_service import UploadService

svc = UploadService()
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 64


def test_valid_photo_passes():
    v = svc.validate(filename="holiday photo.PNG", content_type="image/png", payload=PNG, kind="photo")
    assert v.extension == "png" and v.size_bytes == len(PNG)


def test_rejects_wrong_extension():
    with pytest.raises(UploadError) as e:
        svc.validate(filename="x.gif", content_type="image/gif", payload=PNG, kind="photo")
    assert e.value.code == "bad_extension"


def test_rejects_photo_as_video_and_vice_versa():
    with pytest.raises(UploadError):
        svc.validate(filename="x.png", content_type="image/png", payload=PNG, kind="video")
    with pytest.raises(UploadError):
        svc.validate(filename="x.mp4", content_type="video/mp4", payload=MP4, kind="photo")


def test_rejects_bad_mime():
    with pytest.raises(UploadError) as e:
        svc.validate(filename="x.png", content_type="text/html", payload=PNG, kind="photo")
    assert e.value.code == "bad_mime"


def test_rejects_empty_and_oversize():
    with pytest.raises(UploadError) as e:
        svc.validate(filename="x.png", content_type="image/png", payload=b"", kind="photo")
    assert e.value.code == "empty_file"
    big = PNG + b"\x00" * (16 * 1024 * 1024)
    with pytest.raises(UploadError) as e:
        svc.validate(filename="x.png", content_type="image/png", payload=big, kind="photo")
    assert e.value.code == "file_too_large"


def test_rejects_content_mismatch():
    with pytest.raises(UploadError) as e:
        svc.validate(filename="x.png", content_type="image/png", payload=b"GIF89a" + b"\x00" * 32, kind="photo")
    assert e.value.code == "content_mismatch"


def test_storage_keys_are_uuid_and_never_client_filenames():
    key = svc.storage_key("photo", "png")
    parts = key.split("/")
    assert parts[0] == "photos" and parts[1].isdigit() and len(parts[3].split(".")[0]) == 32
    assert key.endswith(".png")


def test_storage_backend_blocks_path_traversal():
    from app.core.errors import NotFoundError
    from app.services.storage import LocalStorage
    storage = LocalStorage()
    with pytest.raises(NotFoundError):
        storage.open("../../etc/passwd")
    with pytest.raises(NotFoundError):
        storage.open("photos/../../secrets.txt")
