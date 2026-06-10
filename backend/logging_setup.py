"""Logging configuration: ANSI colours, TRACE level, custom formatter and access filter.

Importing this module configures the root logger (handlers + level) as a side effect,
so it must be imported once, early, before the first log call.
"""
import logging
import re

# ── ANSI codes ────────────────────────────────────────────────────────────────
_R   = "\033[0m"
_DIM = "\033[2m"
_B   = "\033[1m"
_CYAN          = "\033[36m"
_BRIGHT_CYAN   = "\033[96m"
_GREEN         = "\033[32m"
_YELLOW        = "\033[33m"
_BRIGHT_YELLOW = "\033[93m"
_RED           = "\033[31m"
_BRIGHT_BLUE   = "\033[94m"
_GRAY          = "\033[90m"

# Уровень TRACE — ниже DEBUG; используется для thumbnail-запросов
TRACE = 5
logging.addLevelName(TRACE, "TRACE")

_HIGHLIGHT_RE = re.compile(
    r"(камера=)(\S+)"         # camera=<name>
    r"|\b(\d+(?:\.\d+)?)\b"  # numbers
)
_IP_RE = re.compile(r'^\d+\.\d+\.\d+\.\d+:\d+ - ')      # "127.0.0.1:12345 - "
_THUMB_RE = re.compile(r'"(?:GET|HEAD) /(?:diff_)?thumbnail/')


def _colorize_msg(msg: str) -> str:
    def _sub(m: re.Match) -> str:
        if m.group(1):
            return f"{m.group(1)}{_BRIGHT_CYAN}{m.group(2)}{_R}"
        return f"{_BRIGHT_YELLOW}{m.group(3)}{_R}"
    return _HIGHLIGHT_RE.sub(_sub, msg)


class _ColorFmt(logging.Formatter):
    _LEVEL_STYLE = {
        TRACE:            _DIM + _GRAY,
        logging.DEBUG:    _DIM + _GRAY,
        logging.INFO:     _GREEN,
        logging.WARNING:  _YELLOW,
        logging.ERROR:    _RED,
        logging.CRITICAL: _B + _RED,
    }

    def format(self, record: logging.LogRecord) -> str:
        ts = self.formatTime(record, "%H:%M:%S")
        lc = self._LEVEL_STYLE.get(record.levelno, "")
        lv = f"{record.levelname:<8}"
        msg = record.getMessage()

        if record.name == "api":
            msg = _colorize_msg(msg)
            name_part = f"{_BRIGHT_BLUE}{_B}api{_R}"
        elif record.name == "uvicorn.access":
            msg = _IP_RE.sub("", msg)   # убираем IP
            msg = f"{_DIM}{msg}{_R}"
            name_part = f"{_DIM}http{_R}"
        else:
            name_part = f"{_DIM}{record.name}{_R}"
            msg = f"{_DIM}{msg}{_R}"

        return f"{_CYAN}{ts}{_R}  {lc}{lv}{_R}  {name_part}: {msg}"


class AccessFilter(logging.Filter):
    """thumbnail → TRACE (скрыт при root=DEBUG); остальное → DEBUG.

    Также подавляет запись, если мутированный уровень ниже root-уровня —
    иначе propagation обходит проверку уровня логгера и DEBUG-строки
    просачиваются в INFO-режиме.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        if _THUMB_RE.search(record.getMessage()):
            record.levelno, record.levelname = TRACE, "TRACE"
        else:
            record.levelno, record.levelname = logging.DEBUG, "DEBUG"
        return record.levelno >= logging.root.level


_handler = logging.StreamHandler()
_handler.setFormatter(_ColorFmt())
_handler.setLevel(TRACE)  # хендлер принимает всё; уровень фильтрует root

logging.root.handlers = [_handler]

# ══════════════════════════════════════════════════════════════════════════════
# УРОВЕНЬ ЛОГА — меняй здесь и только здесь.
#
# Доступные уровни (от самого тихого к самому подробному):
#
#   logging.CRITICAL  — только критические ошибки (приложение падает)
#   logging.ERROR     — ошибки, из-за которых запрос не выполнился
#   logging.WARNING   — предупреждения (что-то подозрительное, но работает)
#   logging.INFO      — наши рабочие логи (старт задач, AI-анализ, сканирование)
#   logging.DEBUG     — всё выше + каждый HTTP-запрос от uvicorn (шумно)
#   TRACE (= 5)       — всё выше + запросы thumbnail (очень шумно)
#
# Рекомендуемые режимы:
#   logging.INFO   → продакшн / нормальная работа (чисто, только важное)
#   logging.DEBUG  → отладка API (видны все HTTP-запросы, кроме thumbnail)
#   TRACE          → отладка thumbnail-пайплайна (максимальный шум)
#
# Пример: чтобы видеть только WARNING и выше:
#   logging.root.setLevel(logging.WARNING)
# ══════════════════════════════════════════════════════════════════════════════
logging.root.setLevel(logging.DEBUG)

# httpx/httpcore генерируют очень много DEBUG-мусора при каждом запросе к compute
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger("api")
