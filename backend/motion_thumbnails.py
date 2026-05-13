"""
4 visualization modes built on a shared MOG2 + morphological pipeline.

Modes:
  neon_mask       — B&W frame + neon-green motion mask
  mhi             — Motion History Image: color trail (newest=white, oldest=blue)
  bounding_boxes  — Original color frame + area-colored bounding boxes
  motion_stacking — Accumulated motion heatmap across all page frames
"""

import hashlib
import sqlite3
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from database import get_thumbnail_path

MOTION_THUMB_DIR = Path(__file__).parent / "motion_thumbnails_cache"

# ── tuneable constants ────────────────────────────────────────────────────────
PROCESS_SIZE = (160, 120)   # downscale for CPU efficiency
OUTPUT_SIZE  = (256, 256)   # final JPEG size
ERODE_KERNEL_SIZE  = 3      # removes thin webs / rain drops
DILATE_KERNEL_SIZE = 7      # restores mass of real objects
MIN_CONTOUR_AREA   = 80     # px² at PROCESS_SIZE; filters small insects / branches
NEON_GREEN = (0, 255, 0)    # BGR

VALID_MODES = frozenset({"neon_mask", "mhi", "bounding_boxes", "motion_stacking"})

_CACHE_VERSION = "v2"  # bump when algorithm changes to invalidate old cache


# ── helpers ───────────────────────────────────────────────────────────────────

def _cache_key(page_file_ids: list[int], threshold: int, mode: str) -> str:
    ids_str = ",".join(str(i) for i in sorted(page_file_ids))
    return hashlib.sha256(f"{mode}:{_CACHE_VERSION}:{ids_str}:{threshold}".encode()).hexdigest()[:16]


def _load_frames(conn: sqlite3.Connection, page_file_ids: list[int]) -> list[tuple[int, np.ndarray]]:
    """Return [(file_id, bgr_at_PROCESS_SIZE), ...] sorted by file_id."""
    frames: list[tuple[int, np.ndarray]] = []
    for fid in sorted(page_file_ids):
        path_str = get_thumbnail_path(conn, fid)
        if not path_str:
            continue
        p = Path(path_str)
        if not p.exists():
            continue
        with Image.open(p) as img:
            arr = np.array(img.convert("RGB"), dtype=np.uint8)
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        frames.append((fid, cv2.resize(bgr, PROCESS_SIZE, interpolation=cv2.INTER_AREA)))
    return frames


def _build_motion_data(
    frames: list[tuple[int, np.ndarray]],
    threshold: int,
) -> list[tuple[int, np.ndarray, np.ndarray, list]]:
    """
    Run the full MOG2 → erode → dilate → contour-filter pipeline.

    Returns list of (file_id, bgr_frame, clean_mask, significant_contours)
    in the same order as `frames`.
    """
    # Stable background: median of all page frames eliminates transient objects.
    # Pre-warm MOG2 so every frame starts from the same reliable background.
    frame_stack = np.array([f for _, f in frames], dtype=np.float32)
    bg_median = np.median(frame_stack, axis=0).astype(np.uint8)

    subtractor = cv2.createBackgroundSubtractorMOG2(
        history=500,
        varThreshold=max(4.0, float(threshold)),
        detectShadows=False,
    )
    for _ in range(50):
        subtractor.apply(bg_median)

    erode_k = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (ERODE_KERNEL_SIZE, ERODE_KERNEL_SIZE)
    )
    dilate_k = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (DILATE_KERNEL_SIZE, DILATE_KERNEL_SIZE)
    )

    result = []
    for fid, frame in frames:
        fg = subtractor.apply(frame, learningRate=0.0)  # frozen background
        fg = cv2.erode(fg, erode_k, iterations=1)
        fg = cv2.dilate(fg, dilate_k, iterations=1)
        contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        significant = [c for c in contours if cv2.contourArea(c) >= MIN_CONTOUR_AREA]
        clean = np.zeros_like(fg)
        if significant:
            cv2.drawContours(clean, significant, -1, 255, thickness=cv2.FILLED)
        result.append((fid, frame, clean, significant))
    return result


def _to_out(frame: np.ndarray) -> np.ndarray:
    return cv2.resize(frame, OUTPUT_SIZE, interpolation=cv2.INTER_LINEAR)


def _mask_to_out(mask: np.ndarray) -> np.ndarray:
    return cv2.resize(mask, OUTPUT_SIZE, interpolation=cv2.INTER_NEAREST)


def _gray_bgr(frame_out: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(cv2.cvtColor(frame_out, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)


# ── visualization modes ───────────────────────────────────────────────────────

def _render_neon_mask(target_bgr: np.ndarray, clean_mask: np.ndarray) -> np.ndarray:
    """
    B&W original frame with neon-green motion mask overlay.
    Cleanest mode: mask only, no bounding boxes.
    """
    display  = _to_out(target_bgr)
    base     = _gray_bgr(display)
    mask_out = _mask_to_out(clean_mask)

    overlay = np.zeros_like(base)
    overlay[mask_out > 0] = NEON_GREEN
    return cv2.addWeighted(base, 0.7, overlay, 0.85, 0)


def _render_mhi(
    motion_data: list[tuple[int, np.ndarray, np.ndarray, list]],
    target_idx: int,
) -> np.ndarray:
    """
    Motion History Image — comet-tail color trail.

    Pixels that were motion most recently appear bright (white/yellow);
    older motion fades through orange → red → dark blue.
    Only frames up to and including the target are considered so the image
    is temporally anchored to the current frame.
    """
    H_p, W_p = PROCESS_SIZE[1], PROCESS_SIZE[0]
    mhi = np.zeros((H_p, W_p), dtype=np.float32)

    # Assign each pixel the normalised time of its last motion (0..1, 1=newest)
    for i in range(target_idx + 1):
        _, _, clean_mask, _ = motion_data[i]
        t = float(i) / max(target_idx, 1) if target_idx > 0 else 1.0
        mhi[clean_mask > 0] = t

    # Upscale and colorise with PLASMA: 0=dark purple (old), 255=yellow (new)
    mhi_up   = cv2.resize(mhi, OUTPUT_SIZE, interpolation=cv2.INTER_LINEAR)
    mhi_norm = (mhi_up * 255).astype(np.uint8)
    colored  = cv2.applyColorMap(mhi_norm, cv2.COLORMAP_PLASMA)

    target_frame = _to_out(motion_data[target_idx][1])
    base = _gray_bgr(target_frame)

    # Overlay only where motion was ever detected
    has_motion = (mhi_up > 0)[..., np.newaxis]
    return np.where(has_motion,
                    cv2.addWeighted(base, 0.25, colored, 0.95, 0),
                    base).astype(np.uint8)


def _render_bounding_boxes(
    target_bgr: np.ndarray,
    significant_contours: list,
) -> np.ndarray:
    """
    Original color frame with bounding boxes colored by contour area.

    Color scale (at PROCESS_SIZE²):
      small  (<300)  → green
      medium (<800)  → orange
      large  (≥800)  → red
    """
    display = _to_out(target_bgr)
    sx = OUTPUT_SIZE[0] / PROCESS_SIZE[0]
    sy = OUTPUT_SIZE[1] / PROCESS_SIZE[1]

    for cnt in significant_contours:
        area  = cv2.contourArea(cnt)
        color = (0, 255, 0) if area < 300 else (0, 165, 255) if area < 800 else (0, 0, 255)
        x, y, w, h = cv2.boundingRect(cnt)
        pt1 = (int(x * sx),       int(y * sy))
        pt2 = (int((x + w) * sx), int((y + h) * sy))
        cv2.rectangle(display, pt1, pt2, color, 2)
        cv2.putText(
            display, f"{int(area)}px",
            (pt1[0], max(pt1[1] - 4, 10)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.28, color, 1, cv2.LINE_AA,
        )
    return display


def _render_motion_stacking(
    motion_data: list[tuple[int, np.ndarray, np.ndarray, list]],
    target_bgr: np.ndarray,
) -> np.ndarray:
    """
    Accumulated motion heatmap across ALL page frames overlaid on the target frame.

    Each pixel's value = number of frames it appeared in motion / max count.
    Result shows the "ghost track" of everything that moved during the whole page window.
    """
    H_p, W_p = PROCESS_SIZE[1], PROCESS_SIZE[0]
    accumulator = np.zeros((H_p, W_p), dtype=np.float32)
    for _, _, clean_mask, _ in motion_data:
        accumulator += (clean_mask > 0).astype(np.float32)

    target_out = _to_out(target_bgr)
    base       = _gray_bgr(target_out)

    if accumulator.max() == 0:
        return base

    heat_norm = (accumulator / accumulator.max() * 255).astype(np.uint8)
    heat_up   = cv2.resize(heat_norm, OUTPUT_SIZE, interpolation=cv2.INTER_LINEAR)
    heat_col  = cv2.applyColorMap(heat_up, cv2.COLORMAP_JET)

    has_motion = (heat_up > 0)[..., np.newaxis]
    return np.where(has_motion,
                    cv2.addWeighted(base, 0.35, heat_col, 0.85, 0),
                    base).astype(np.uint8)


# ── public entry point ────────────────────────────────────────────────────────

def get_or_create_motion_thumbnail(
    conn: sqlite3.Connection,
    file_id: int,
    page_file_ids: list[int],
    threshold: int,
    mode: str,
) -> Path:
    if mode not in VALID_MODES:
        raise ValueError(f"Unknown mode '{mode}'. Valid: {sorted(VALID_MODES)}")

    MOTION_THUMB_DIR.mkdir(exist_ok=True)
    key        = _cache_key(page_file_ids, threshold, mode)
    cache_path = MOTION_THUMB_DIR / f"{key}_{file_id}.jpg"
    if cache_path.exists():
        return cache_path

    frames = _load_frames(conn, page_file_ids)
    if not frames:
        raise FileNotFoundError("No thumbnails found for page")

    target_idx = next((i for i, (fid, _) in enumerate(frames) if fid == file_id), None)
    if target_idx is None:
        raise FileNotFoundError(f"Thumbnail not found for file {file_id}")

    motion_data = _build_motion_data(frames, threshold)
    _, target_frame, clean_mask, significant = motion_data[target_idx]

    if mode == "neon_mask":
        result = _render_neon_mask(target_frame, clean_mask)
    elif mode == "mhi":
        result = _render_mhi(motion_data, target_idx)
    elif mode == "bounding_boxes":
        result = _render_bounding_boxes(target_frame, significant)
    else:  # motion_stacking
        result = _render_motion_stacking(motion_data, target_frame)

    result_rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
    Image.fromarray(result_rgb).save(cache_path, "JPEG", quality=85, optimize=True)
    return cache_path
