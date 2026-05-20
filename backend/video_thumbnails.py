"""Video thumbnail generation for various preview modes."""
import logging
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("video_thumbnails")

VID_THUMB_DIR = Path(__file__).parent / "video_thumbnails_cache"
VALID_MODES = ("first_frame", "last_frame", "four_frames", "max_change_gif")

# Output thumbnail dimensions
CELL_W, CELL_H = 200, 150  # per cell for four_frames grid
SINGLE_W, SINGLE_H = 400, 300  # for first/last frame


def _read_frame(cap, frame_pos: int):
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_pos)
    ok, frame = cap.read()
    if not ok:
        return None
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def _resize_to(img: Image.Image, w: int, h: int) -> Image.Image:
    """Resize PIL image to exactly (w, h) with black letterboxing."""
    src_w, src_h = img.size
    scale = min(w / src_w, h / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), (0, 0, 0))
    canvas.paste(img, ((w - new_w) // 2, (h - new_h) // 2))
    return canvas


def get_or_create_video_thumbnail(file_id: int, file_path: str, mode: str) -> Path:
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode: {mode}")

    VID_THUMB_DIR.mkdir(exist_ok=True)
    ext = "gif" if mode == "max_change_gif" else "jpg"
    cache_path = VID_THUMB_DIR / f"{file_id}_{mode}.{ext}"
    if cache_path.exists():
        return cache_path

    src = Path(file_path)
    if not src.exists():
        raise FileNotFoundError(f"Video not found: {file_path}")

    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {file_path}")

    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total < 1:
            total = 1

        if mode == "first_frame":
            frame = _read_frame(cap, 0)
            if frame is None:
                raise ValueError("Cannot read first frame")
            img = _resize_to(Image.fromarray(frame), SINGLE_W, SINGLE_H)
            img.save(cache_path, "JPEG", quality=82)

        elif mode == "last_frame":
            frame = _read_frame(cap, max(0, total - 2))
            if frame is None:
                frame = _read_frame(cap, 0)
            if frame is None:
                raise ValueError("Cannot read last frame")
            img = _resize_to(Image.fromarray(frame), SINGLE_W, SINGLE_H)
            img.save(cache_path, "JPEG", quality=82)

        elif mode == "four_frames":
            positions = [
                0,
                total // 3,
                2 * total // 3,
                max(0, total - 2),
            ]
            cells = []
            for pos in positions:
                f = _read_frame(cap, pos)
                if f is not None:
                    cells.append(_resize_to(Image.fromarray(f), CELL_W, CELL_H))
            while len(cells) < 4:
                cells.append(Image.new("RGB", (CELL_W, CELL_H), (20, 20, 30)))

            grid = Image.new("RGB", (CELL_W * 2, CELL_H * 2))
            for i, cell in enumerate(cells):
                col, row = i % 2, i // 2
                grid.paste(cell, (col * CELL_W, row * CELL_H))
            grid.save(cache_path, "JPEG", quality=82)

        elif mode == "max_change_gif":
            n_samples = min(40, max(2, total))
            sample_positions = [int(i * (total - 1) / (n_samples - 1)) for i in range(n_samples)]

            frame0 = _read_frame(cap, 0)
            if frame0 is None:
                raise ValueError("Cannot read frame 0")

            gray0 = np.mean(frame0.astype(np.float32), axis=2)

            best_diff = -1.0
            best_frame = None
            for pos in sample_positions[1:]:
                f = _read_frame(cap, pos)
                if f is None:
                    continue
                gray = np.mean(f.astype(np.float32), axis=2)
                diff = float(np.mean(np.abs(gray0 - gray)))
                if diff > best_diff:
                    best_diff = diff
                    best_frame = f

            if best_frame is None:
                best_frame = frame0

            img0 = _resize_to(Image.fromarray(frame0), SINGLE_W, SINGLE_H)
            img1 = _resize_to(Image.fromarray(best_frame), SINGLE_W, SINGLE_H)

            # Quantize to 256 colours for GIF
            img0q = img0.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
            img1q = img1.quantize(colors=256, method=Image.Quantize.MEDIANCUT)

            img0q.save(
                cache_path, "GIF",
                save_all=True,
                append_images=[img1q],
                loop=0,
                duration=500,
                optimize=False,
            )

    finally:
        cap.release()

    return cache_path
