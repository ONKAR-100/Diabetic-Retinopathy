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
            self._base_url = f"{url}/storage/v1/object"
            self._ensure_buckets()
            logger.info("Supabase Storage initialized successfully.")
        except Exception as exc:
            logger.error(f"Failed to initialize Supabase Storage: {exc}. Using local fallback.")
            self._client = None

    # ── Bucket setup ─────────────────────────────────────────────────────────
    def _ensure_buckets(self):
        """Create private buckets if they don't exist, or update existing to private."""
        from config import settings
        buckets = [
            settings.STORAGE_BUCKET_UPLOADS,
            settings.STORAGE_BUCKET_RESULTS,
            settings.STORAGE_BUCKET_REPORTS,
        ]
        try:
            existing_buckets = self._client.storage.list_buckets()
            existing_map = {b.name: b for b in existing_buckets}
        except Exception as exc:
            logger.warning(f"Could not list buckets: {exc}")
            existing_map = {}

        for bucket in buckets:
            if bucket not in existing_map:
                try:
                    self._client.storage.create_bucket(bucket, options={"public": False})
                    logger.info(f"Created private Supabase bucket: {bucket}")
                except Exception as exc:
                    logger.warning(f"Could not create private bucket {bucket}: {exc}")
            else:
                b = existing_map[bucket]
                is_public = getattr(b, "public", None)
                if is_public is True or is_public is None:
                    try:
                        try:
                            self._client.storage.update_bucket(bucket, options={"public": False})
                        except TypeError:
                            self._client.storage.update_bucket(bucket, public=False)
                        logger.info(f"Updated existing Supabase bucket to private: {bucket}")
                    except Exception as exc:
                        logger.warning(f"Could not update bucket {bucket} to private: {exc}")

    # ── Core upload ──────────────────────────────────────────────────────────
    def upload_bytes(
        self,
        data: bytes,
        bucket: str,
        path: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        Upload raw bytes to private Supabase Storage.

        Returns:
            Short-lived signed URL or local media URL.
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
            signed_url = self.get_signed_url(bucket, path)
            logger.debug(f"Uploaded to Supabase private storage: {bucket}/{path}")
            return signed_url
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

    def get_signed_url(self, bucket: str, path: str, expires_in: int = 900) -> str:
        """
        Generate a short-lived signed URL for an object in a private Supabase bucket.
        Default expiry: 900 seconds (15 minutes).
        Falls back to authenticated /api/media/... path if Supabase is unavailable.
        """
        self._init()
        if self._client is not None:
            try:
                res = self._client.storage.from_(bucket).create_signed_url(path, expires_in)
                if isinstance(res, dict):
                    signed = res.get("signedURL") or res.get("signedUrl") or res.get("url")
                    if signed:
                        return signed
                elif isinstance(res, str):
                    return res
            except Exception as exc:
                logger.error(f"Failed to create signed URL for {bucket}/{path}: {exc}")

        # Local fallback
        clean = path.replace("\\", "/").lstrip("/")
        return f"/api/media/{clean}"

    def get_public_url(self, bucket: str, path: str) -> str:
        """
        Deprecated for clinical assets. Returns a short-lived signed URL instead
        to eliminate permanent public clinical URL exposure.
        """
        return self.get_signed_url(bucket, path)

    def download_bytes(self, bucket: str, path: str) -> bytes:
        """
        Download raw object bytes from private Supabase Storage or local disk.
        Used for internal operations (e.g. PDF report compilation).
        """
        self._init()
        if self._client is not None:
            try:
                data = self._client.storage.from_(bucket).download(path)
                return data
            except Exception as exc:
                logger.error(f"Supabase download failed for {bucket}/{path}: {exc}")

        # Local fallback
        local_path = self.get_local_path(path)
        if not local_path or not os.path.exists(local_path):
            candidate = os.path.join(settings.STATIC_DIR, path.replace("\\", "/").lstrip("/"))
            if os.path.exists(candidate):
                local_path = candidate

        if local_path and os.path.exists(local_path):
            with open(local_path, "rb") as f:
                return f.read()

        raise FileNotFoundError(f"Clinical asset not found: {bucket}/{path}")

    def download_bytes_from_url(self, url: str) -> bytes:
        """
        Download raw object bytes given a full or partial URL/path.
        Extracts bucket and object key for Supabase URLs or reads local disk.
        """
        if not url:
            raise ValueError("URL cannot be empty")

        clean = url.replace("\\", "/").strip()
        for bucket in [settings.STORAGE_BUCKET_UPLOADS, settings.STORAGE_BUCKET_RESULTS, settings.STORAGE_BUCKET_REPORTS]:
            for marker in [f"/storage/v1/object/public/{bucket}/", f"/storage/v1/object/sign/{bucket}/"]:
                if marker in clean:
                    obj_path = clean.split(marker, 1)[1].split("?")[0]
                    return self.download_bytes(bucket, obj_path)

        local_path = self.get_local_path(clean)
        if local_path and os.path.exists(local_path):
            with open(local_path, "rb") as f:
                return f.read()

        raise FileNotFoundError(f"Could not resolve asset for download: {url}")

    def resolve_asset_url(self, url_or_path: Optional[str], expires_in: int = 900) -> Optional[str]:
        """
        Backward-compatible URL and reference resolver.
        - Resolves historical Supabase public URLs to short-lived signed URLs.
        - Converts local /static/... or relative paths to authenticated /api/media/...
        - Preserves existing signed URLs or clean /api/media/... URLs.
        """
        if not url_or_path:
            return None

        clean = url_or_path.replace("\\", "/").strip()
        if not clean:
            return None

        # 1. Supabase URLs
        if clean.startswith("http://") or clean.startswith("https://"):
            for bucket in [settings.STORAGE_BUCKET_UPLOADS, settings.STORAGE_BUCKET_RESULTS, settings.STORAGE_BUCKET_REPORTS]:
                marker_public = f"/storage/v1/object/public/{bucket}/"
                marker_sign = f"/storage/v1/object/sign/{bucket}/"
                if marker_public in clean:
                    obj_path = clean.split(marker_public, 1)[1].split("?")[0]
                    return self.get_signed_url(bucket, obj_path, expires_in)
                if marker_sign in clean:
                    obj_path = clean.split(marker_sign, 1)[1].split("?")[0]
                    return self.get_signed_url(bucket, obj_path, expires_in)
            return clean

        # 2. Canonical storage object paths when Supabase is active
        if self._client is not None:
            if "_longitudinal_diff" in clean:
                obj_path = clean.split("results/")[-1].lstrip("/")
                return self.get_signed_url(settings.STORAGE_BUCKET_RESULTS, obj_path, expires_in)

        # 3. Local media paths
        if clean.startswith("/api/media/"):
            return clean

        if clean.startswith("/static/"):
            rel = clean[len("/static/"):]
            return f"/api/media/{rel}"
        if clean.startswith("static/"):
            rel = clean[len("static/"):]
            return f"/api/media/{rel}"

        # Relative path inside STATIC_DIR (e.g. uploads/... or results/...)
        return f"/api/media/{clean.lstrip('/')}"

    # ── Local filesystem resolution ──────────────────────────────────────────
    def get_local_path(self, url_or_path: str) -> Optional[str]:
        """
        Convert a local /static/... or /api/media/... URL or relative storage path into
        an absolute filesystem path on the host system. Returns None if url_or_path is an
        external HTTP(S) URL or empty.
        """
        if not url_or_path or url_or_path.startswith("http://") or url_or_path.startswith("https://"):
            return None

        if os.path.isabs(url_or_path) and os.path.exists(url_or_path):
            return os.path.abspath(url_or_path)

        clean = url_or_path.replace("\\", "/")
        if clean.startswith("/api/media/"):
            rel_path = clean[len("/api/media/"):]
        elif clean.startswith("api/media/"):
            rel_path = clean[len("api/media/"):]
        elif clean.startswith("/static/"):
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
        """Save bytes to local static/ dir and return an authenticated /api/media/... URL."""
        clean_path = path.replace("\\", "/").lstrip("/")
        local_path = os.path.join(settings.STATIC_DIR, *clean_path.split("/"))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        return f"/api/media/{clean_path}"

    def delete_asset(self, url_or_path: Optional[str]) -> bool:
        """
        Delete a clinical asset from private Supabase Storage or local disk.
        Returns True if deleted or already absent, False if deletion failed.
        """
        if not url_or_path:
            return True

        self._init()
        clean = url_or_path.replace("\\", "/").strip()
        deleted = False

        # 1. Supabase deletion if client is available
        if self._client is not None:
            for bucket in [settings.STORAGE_BUCKET_UPLOADS, settings.STORAGE_BUCKET_RESULTS, settings.STORAGE_BUCKET_REPORTS]:
                for marker in [f"/storage/v1/object/public/{bucket}/", f"/storage/v1/object/sign/{bucket}/", f"{bucket}/"]:
                    if marker in clean:
                        obj_path = clean.split(marker, 1)[1].split("?")[0]
                        try:
                            self._client.storage.from_(bucket).remove([obj_path])
                            deleted = True
                            logger.info(f"Deleted Supabase object: {bucket}/{obj_path}")
                        except Exception as exc:
                            logger.warning(f"Failed to delete Supabase object {bucket}/{obj_path}: {exc}")
                        break

        # 2. Local filesystem deletion
        local_path = self.get_local_path(clean)
        if not local_path or not os.path.exists(local_path):
            candidate = os.path.join(settings.STATIC_DIR, clean.lstrip("/"))
            if os.path.exists(candidate):
                local_path = candidate

        if local_path and os.path.exists(local_path):
            try:
                os.unlink(local_path)
                deleted = True
                logger.info(f"Deleted local asset: {local_path}")
            except Exception as exc:
                logger.warning(f"Failed to delete local asset {local_path}: {exc}")

        return deleted


# Singleton instance — import this everywhere
storage_service = StorageService()
