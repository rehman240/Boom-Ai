"""What may be uploaded, and how it is checked.

The browser's content type is the uploader's word for it, so the real type is read from
the first bytes of the file instead. SVG is refused: it is a script-capable document, and
serving one from our own origin would let it act as this app.
"""

from fastapi import HTTPException

# Detected type -> the extension used for its storage key.
ALLOWED_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

KINDS = ("logo", "reference")
MAX_FILES_PER_PROJECT = 10

# Images are shown in the page; a PDF is downloaded rather than opened in place.
INLINE_TYPES = {"image/png", "image/jpeg", "image/webp"}


def detect_type(data: bytes) -> str | None:
    """The file's actual type from its signature, or None if we don't accept it."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return None


def looks_like_svg(data: bytes) -> bool:
    head = data[:512].lstrip().lower()
    return head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head)


def check_file(data: bytes, max_bytes: int) -> str:
    """Return the accepted content type, or raise with a message the user can act on."""
    if not data:
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413, detail=f"That file is larger than {max_bytes // (1024 * 1024)} MB."
        )
    if looks_like_svg(data):
        raise HTTPException(
            status_code=415, detail="SVG files aren't accepted. Please upload a PNG, JPEG or WebP."
        )

    content_type = detect_type(data)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Please upload a PNG, JPEG, WebP or PDF file.")
    return content_type


def safe_filename(name: str | None) -> str:
    """Kept for display only; it never reaches a path or a storage key."""
    cleaned = (name or "file").replace("\\", "/").split("/")[-1].strip()
    return (cleaned or "file")[:255]
