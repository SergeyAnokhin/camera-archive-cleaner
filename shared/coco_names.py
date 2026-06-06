"""COCO class names → Russian keywords.

Used by the compute-service to translate YOLO detections to Russian.
The authoritative emoji mapping lives in frontend/src/cocoClasses.js.
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
