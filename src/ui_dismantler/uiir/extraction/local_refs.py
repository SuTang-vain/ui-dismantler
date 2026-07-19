"""Resolve local HTML resource references without assuming the filesystem root is the web root."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote, urlsplit


def resolve_local_reference(document_path: str | Path, reference: str) -> Path | None:
    """Resolve relative and root-relative local URLs against a nearby project root.

    For ``/shared/app.js`` opened from ``project/pages/index.html``, browsers normally
    use the site's web root. A ``file://`` load instead points at ``/shared/app.js``.
    We conservatively search the document's ancestor directories for the referenced
    path and return the nearest existing file. Remote/data URLs remain unsupported.
    """
    document = Path(document_path).expanduser().resolve()
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc or reference.startswith(("//", "data:")):
        return None
    clean = unquote(parsed.path)
    if not clean:
        return None
    if not clean.startswith("/"):
        return (document.parent / clean).resolve()

    relative = clean.lstrip("/")
    for root in document.parents:
        candidate = (root / relative).resolve()
        if candidate.is_file():
            return candidate
    return Path(clean).resolve()
