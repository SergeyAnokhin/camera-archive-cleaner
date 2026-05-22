"""COCO class names → Russian keywords.

Cross-boundary contract: the Russian words here must match OBJECT_EMOJI_DEFAULTS
in frontend/src/aiHelpers.js. Change one side, change both.

Used by the compute-service to translate YOLO detections.
"""

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
