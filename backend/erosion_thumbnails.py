import hashlib
import sqlite3
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from compute_cache import CACHE_BASE_DIR
from database import get_thumbnail_path

EROSION_THUMB_DIR = CACHE_BASE_DIR / "erosion"

# Processing resolution — CPU-friendly downscale
PROCESS_SIZE = (160, 120)
# Output thumbnail size (matches other modes)
OUTPUT_SIZE = (256, 256)
# Ellipse kernels for morphological ops
ERODE_KERNEL_SIZE = 3    # removes thin spider webs, individual raindrops
DILATE_KERNEL_SIZE = 7   # restores mass/volume of real objects
# Minimum contour area at PROCESS_SIZE scale to discard small insects/branches
MIN_CONTOUR_AREA = 80
# Neon green in BGR
NEON_GREEN = (0, 255, 0)


_CACHE_VERSION = "v2"  # bump when algorithm changes to invalidate old cache

def _cache_key(page_file_ids: list[int], threshold: int) -> str:
    ids_str = ",".join(str(i) for i in sorted(page_file_ids))
    return hashlib.sha256(f"erosion:{_CACHE_VERSION}:{ids_str}:{threshold}".encode()).hexdigest()[:16]


def get_or_create_erosion_thumbnail(
    conn: sqlite3.Connection,
    file_id: int,
    page_file_ids: list[int],
    threshold: int,
) -> Path:
    EROSION_THUMB_DIR.mkdir(exist_ok=True)
    key = _cache_key(page_file_ids, threshold)
    cache_path = EROSION_THUMB_DIR / f"{key}_{file_id}.jpg"
    if cache_path.exists():
        return cache_path

    # Load thumbnails as BGR numpy arrays at PROCESS_SIZE
    frames: list[tuple[int, np.ndarray]] = []
    for fid in sorted(page_file_ids):
        thumb_path_str = get_thumbnail_path(conn, fid)
        if not thumb_path_str:
            continue
        p = Path(thumb_path_str)
        if not p.exists():
            continue
        with Image.open(p) as img:
            arr = np.array(img.convert("RGB"), dtype=np.uint8)
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        small = cv2.resize(bgr, PROCESS_SIZE, interpolation=cv2.INTER_AREA)
        frames.append((fid, small))

    if not frames:
        raise FileNotFoundError(f"No thumbnails found for page")

    # Stable background: median of all page frames.
    # Median naturally excludes transient objects (person in <50% of frames).
    # Pre-warm MOG2 with this median so every frame — including the first —
    # starts from a reliable background instead of cold-starting.
    frame_stack = np.array([f for _, f in frames], dtype=np.float32)
    bg_median = np.median(frame_stack, axis=0).astype(np.uint8)

    subtractor = cv2.createBackgroundSubtractorMOG2(
        history=500,
        varThreshold=max(4.0, float(threshold)),
        detectShadows=False,
    )
    for _ in range(50):
        subtractor.apply(bg_median)

    # Process actual frames with frozen background (learningRate=0)
    fg_mask: np.ndarray | None = None
    target_frame: np.ndarray | None = None
    for fid, frame in frames:
        current_mask = subtractor.apply(frame, learningRate=0.0)
        if fid == file_id:
            fg_mask = current_mask
            target_frame = frame

    if fg_mask is None or target_frame is None:
        raise FileNotFoundError(f"Thumbnail not found for file {file_id}")

    # Morphological pipeline: erode → dilate
    erode_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (ERODE_KERNEL_SIZE, ERODE_KERNEL_SIZE)
    )
    dilate_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (DILATE_KERNEL_SIZE, DILATE_KERNEL_SIZE)
    )
    mask = cv2.erode(fg_mask, erode_kernel, iterations=1)
    mask = cv2.dilate(mask, dilate_kernel, iterations=1)

    # Keep only contours large enough to be a real object
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    significant = [c for c in contours if cv2.contourArea(c) >= MIN_CONTOUR_AREA]

    # Rebuild mask from significant contours only
    clean_mask = np.zeros_like(mask)
    if significant:
        cv2.drawContours(clean_mask, significant, -1, 255, thickness=cv2.FILLED)

    # Compose output at OUTPUT_SIZE
    display = cv2.resize(target_frame, OUTPUT_SIZE, interpolation=cv2.INTER_LINEAR)
    gray_bgr = cv2.cvtColor(cv2.cvtColor(display, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)

    mask_display = cv2.resize(clean_mask, OUTPUT_SIZE, interpolation=cv2.INTER_NEAREST)

    # Neon green overlay on motion areas
    neon_layer = np.zeros_like(gray_bgr)
    neon_layer[mask_display > 0] = NEON_GREEN
    result = cv2.addWeighted(gray_bgr, 0.7, neon_layer, 0.8, 0)

    # Bounding boxes scaled to OUTPUT_SIZE
    scale_x = OUTPUT_SIZE[0] / PROCESS_SIZE[0]
    scale_y = OUTPUT_SIZE[1] / PROCESS_SIZE[1]
    for cnt in significant:
        x, y, w, h = cv2.boundingRect(cnt)
        x1, y1 = int(x * scale_x), int(y * scale_y)
        x2, y2 = int((x + w) * scale_x), int((y + h) * scale_y)
        cv2.rectangle(result, (x1, y1), (x2, y2), NEON_GREEN, 2)

    result_rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
    Image.fromarray(result_rgb).save(cache_path, "JPEG", quality=85, optimize=True)
    return cache_path
