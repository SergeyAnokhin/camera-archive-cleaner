"""Local YOLO / OpenVINO object detection: model loading, COCO→Russian names, thumbnail cache paths.

Shared by the OpenVINO thumbnail endpoint and the OpenVINO analysis endpoints.
"""
import hashlib
import logging
from pathlib import Path

from fastapi import HTTPException

logger = logging.getLogger("api")

OV_THUMB_DIR = Path(__file__).parent / "openvino_thumbnails_cache"
OV_THUMB_VERSION = "v1"

# Maps COCO English class names → Russian keywords (matching aiHelpers.js vocabulary)
COCO_TO_RUSSIAN: dict[str, str] = {
    'person':     'человек',
    'bicycle':    'велосипед',
    'car':        'машина',
    'motorcycle': 'мотоцикл',
    'airplane':   'самолёт',
    'bus':        'автобус',
    'train':      'поезд',
    'truck':      'грузовик',
    'boat':       'лодка',
    'bird':       'птица',
    'cat':        'кошка',
    'dog':        'собака',
    'horse':      'лошадь',
    'sheep':      'овца',
    'cow':        'корова',
    'elephant':   'слон',
    'bear':       'медведь',
    'zebra':      'зебра',
    'giraffe':    'жираф',
    'backpack':   'рюкзак',
    'umbrella':   'зонт',
    'handbag':    'сумка',
    'suitcase':   'чемодан',
}

_yolo_models: dict = {}


# Reverse map: Russian label → COCO English class name
RUSSIAN_TO_COCO: dict[str, str] = {v: k for k, v in COCO_TO_RUSSIAN.items()}


def excluded_to_en(excluded_labels: set[str]) -> set[str]:
    """Convert a set of excluded labels (Russian or English) → COCO English class names."""
    result = set()
    for label in excluded_labels:
        lo = label.lower()
        en = RUSSIAN_TO_COCO.get(lo)
        result.add(en if en else lo)
    return result


def ov_cache_path(file_id: int, model: str, confidence: float,
                  excluded: frozenset[str] = frozenset()) -> Path:
    excl_str = ','.join(sorted(excluded))
    key = f"{OV_THUMB_VERSION}:{file_id}:{model}:{confidence:.2f}:{excl_str}"
    h = hashlib.sha256(key.encode()).hexdigest()[:16]
    return OV_THUMB_DIR / f"{h}.jpg"


def load_yolo(model_name: str):
    """Load YOLO model lazily. Tries local OpenVINO export first, falls back to .pt."""
    if model_name not in _yolo_models:
        try:
            from ultralytics import YOLO
        except ImportError:
            raise HTTPException(status_code=500, detail="ultralytics not installed. Run: pip install ultralytics openvino")
        ov_path = Path(__file__).parent / "models" / f"{model_name}_openvino_model"
        if ov_path.exists():
            logger.info("🔷 Loading OpenVINO model: %s", ov_path)
            _yolo_models[model_name] = YOLO(str(ov_path), task="detect")
        else:
            logger.info("🔷 Loading PyTorch model: %s.pt (tip: export with `yolo export model=%s.pt format=openvino` for faster Intel CPU inference)", model_name, model_name)
            _yolo_models[model_name] = YOLO(f"{model_name}.pt", task="detect")
    return _yolo_models[model_name]
