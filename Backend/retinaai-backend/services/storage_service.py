"""
Supabase Storage Service
========================
Centralizes ALL file operations for the RetinaAI backend.

Every image (uploads, gradcam, vessel, OD/fovea) and every PDF report
is stored in Supabase Storage. Local disk is used ONLY as a temporary
buffer during processing — nothing is permanently kept on local disk.

Buckets (created automatically on first use):
  retina-uploads  → raw fundus photos uploaded by the health worker
  retina-results  → AI result overlays (gradcam, vessel, od/fovea)
  retina-reports  → generated PDF reports

Public URLs:
  All buckets are configured as PUBLIC so the frontend can display
  images directly without needing signed URL proxying.
  URL format:  <SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>

Usage:
    from services.storage_service import storage_service
    url = storage_service.upload_bytes(data, "retina-results", "uuid/left_gradcam.jpg")
    url = storage_service.upload_cv2_image(bgr_array, "retina-results", "uuid/left_vessel.jpg")
    url = storage_service.upload_file(local_path, "retina-uploads", "uuid_eye.jpg")
"""

import io
import logging
import os
import tempfile
from typing import Optional

import cv2
import numpy as np

from config import settings

logger = logging.getLogger(__name__)

# ── Lazy-import supabase so the rest of the app still boots even
#    if the library is missing (graceful degradation to local paths) ──────────
try:
    from supabase import create_client, Client
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    logger.warning("supabase-py not installed. Storage will fall back to local files.")


class StorageService:
    """
    Supabase Storage wrapper.  All upload methods return a PUBLIC URL string.
    If Supabase is not configured (missing keys) the service falls back to
    saving files locally and returning a /static/... path — ensuring the rest
    of the pipeline never breaks during development.
    """

    def __init__(self):
        self._client: Optional["Client"] = None
        self._base_url: str = ""
        self._initialized = False

    # ── Internal initializer (called lazily on first use) ────────────────────
    def _init(self):
        if self._initialized:
            return
        self._initialized = True

        from config import settings

        url = settings.SUPABASE_URL
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY

        if not url or not key or key.startswith("PASTE_"):
            logger.warning(
                "Supabase API keys not configured in .env "
                "(SUPABASE_SERVICE_ROLE_KEY is missing or still placeholder). "
                "Falling back to local file storage."
            )
            return

        if not _SUPABASE_AVAILABLE:
            logger.warning("supabase-py not installed — using local storage fallback.")
            return

        try:
            self._client = create_client(url, key)
            self._base_url = f"{url}/storage/v1/object/public"
            self._ensure_buckets()
            logger.info("Supabase Storage initialized successfully.")
        except Exception as exc:
            logger.error(f"Failed to initialize Supabase Storage: {exc}. Using local fallback.")
            self._client = None

    # ── Bucket setup ─────────────────────────────────────────────────────────
    def _ensure_buckets(self):
        """Create buckets if they don't exist."""
        from config import settings
        buckets = [
            settings.STORAGE_BUCKET_UPLOADS,
            settings.STORAGE_BUCKET_RESULTS,
            settings.STORAGE_BUCKET_REPORTS,
        ]
        existing = {b.name for b in self._client.storage.list_buckets()}
        for bucket in buckets:
            if bucket not in existing:
                try:
                    self._client.storage.create_bucket(bucket, options={"public": True})
                    logger.info(f"Created Supabase bucket: {bucket}")
                except Exception as exc:
                    logger.warning(f"Could not create bucket {bucket}: {exc}")

    # ── Core upload ──────────────────────────────────────────────────────────
    def upload_bytes(
        self,
        data: bytes,
        bucket: str,
        path: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        Upload raw bytes to Supabase Storage.

        Returns:
            Public URL of the uploaded file.
        """
        self._init()

        if self._client is None:
            return self._local_fallback_bytes(data, path)

        try:
            # Upsert so re-uploads don't fail
            self._client.storage.from_(bucket).upload(
                path=path,
                file=data,
                file_options={"content-type": content_type, "upsert": "true"},
            )
            url = f"{self._base_url}/{bucket}/{path}"
            logger.debug(f"Uploaded to Supabase: {url}")
            return url
        except Exception as exc:
            logger.error(f"Supabase upload failed for {bucket}/{path}: {exc}")
            return self._local_fallback_bytes(data, path)

    # ── Convenience wrappers ─────────────────────────────────────────────────
    def upload_cv2_image(
        self,
        bgr: np.ndarray,
        bucket: str,
        path: str,
    ) -> str:
        """
        Encode a BGR numpy array (OpenCV image) as JPEG/PNG and upload to Supabase.
        The extension in `path` determines the codec (.jpg → JPEG, .png → PNG).
        """
        ext = os.path.splitext(path)[-1].lower()
        if ext == ".png":
            ok, buf = cv2.imencode(".png", bgr)
            content_type = "image/png"
        else:
            ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
            content_type = "image/jpeg"

        if not ok:
            raise ValueError(f"cv2.imencode failed for path={path}")

        return self.upload_bytes(buf.tobytes(), bucket, path, content_type)

    def upload_pdf_buffer(self, buffer: io.BytesIO, bucket: str, path: str) -> str:
        """Upload an in-memory PDF buffer to Supabase Storage."""
        buffer.seek(0)
        return self.upload_bytes(buffer.read(), bucket, path, "application/pdf")

    def upload_local_file(self, local_path: str, bucket: str, storage_path: str) -> str:
        """
        Read a local file and upload it to Supabase Storage.
        Used for uploading the original fundus image after saving it temporarily.
        """
        with open(local_path, "rb") as f:
            data = f.read()
        ext = os.path.splitext(local_path)[-1].lower()
        content_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
        return self.upload_bytes(data, bucket, storage_path, content_type)

    def get_public_url(self, bucket: str, path: str) -> str:
        """Return the public URL for an already-uploaded file."""
        self._init()
        return f"{self._base_url}/{bucket}/{path}"

    # ── Local filesystem resolution ──────────────────────────────────────────
    def get_local_path(self, url_or_path: str) -> Optional[str]:
        """
        Convert a local /static/... URL or relative storage path into an absolute
        filesystem path on the host system. Returns None if url_or_path is an
        external HTTP(S) URL or empty.
        """
        if not url_or_path or url_or_path.startswith("http://") or url_or_path.startswith("https://"):
            return None

        clean = url_or_path.replace("\\", "/")
        if clean.startswith("/static/"):
            rel_path = clean[len("/static/"):]
        elif clean.startswith("static/"):
            rel_path = clean[len("static/"):]
        else:
            rel_path = clean.lstrip("/")

        parts = [p for p in rel_path.split("/") if p and p != ".."]

        # 1. Check canonical configured STATIC_DIR
        candidate = os.path.join(settings.STATIC_DIR, *parts)
        if os.path.exists(candidate):
            return candidate

        # 2. Check relative to current working directory if different
        fallback = os.path.join("static", *parts)
        if os.path.exists(fallback):
            return os.path.abspath(fallback)

        return candidate

    # ── Local fallback ───────────────────────────────────────────────────────
    def _local_fallback_bytes(self, data: bytes, path: str) -> str:
        """Save bytes to local static/ dir and return a /static/... URL."""
        clean_path = path.replace("\\", "/").lstrip("/")
        local_path = os.path.join(settings.STATIC_DIR, *clean_path.split("/"))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        return f"/static/{clean_path}"


# Singleton instance — import this everywhere
storage_service = StorageService()

