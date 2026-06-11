"""Logging configuration: ANSI colours, TRACE level, custom formatter and access filter.

Importing this module configures the root logger (handlers + level) as a side effect,
so it must be imported once, early, before the first log call.
"""
import collections
import json
import logging
import re
import threading
from pathlib import Path

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

# Уровень TRACE — ниже DEBUG; используется для thumbnail-запросов и polling
TRACE = 5
logging.addLevelName(TRACE, "TRACE")

_HIGHLIGHT_RE = re.compile(
    r"(камера=)(\S+)"         # camera=<name>
    r"|\b(\d+(?:\.\d+)?)\b"  # numbers
)
_IP_RE = re.compile(r'^\d+\.\d+\.\d+\.\d+:\d+ - ')      # "127.0.0.1:12345 - "
_THUMB_RE = re.compile(r'"(?:GET|HEAD) /(?:diff_)?thumbnail/')
# High-frequency polling endpoints — demoted to TRACE so they're hidden at DEBUG level
_NOISY_RE = re.compile(r'"(?:GET|HEAD) /(?:services/status|cameras)\b')


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


class _PlainFmt(logging.Formatter):
    """Plain-text formatter (no ANSI) — used for ring buffer and log file."""
    def format(self, record: logging.LogRecord) -> str:
        ts = self.formatTime(record, "%H:%M:%S")
        lv = f"{record.levelname:<8}"
        msg = record.getMessage()
        if record.name == "uvicorn.access":
            msg = _IP_RE.sub("", msg)
        return f"{ts}  {lv}  {record.name}: {msg}"


class AccessFilter(logging.Filter):
    """thumbnail + noisy polling → TRACE (скрыт при root=DEBUG); остальное → DEBUG.

    Также подавляет запись, если мутированный уровень ниже root-уровня —
    иначе propagation обходит проверку уровня логгера и DEBUG-строки
    просачиваются в INFO-режиме.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if _THUMB_RE.search(msg) or _NOISY_RE.search(msg):
            record.levelno, record.levelname = TRACE, "TRACE"
        else:
            record.levelno, record.levelname = logging.DEBUG, "DEBUG"
        return record.levelno >= logging.root.level


class RingBufferHandler(logging.Handler):
    """Keeps last max_lines records in memory; flushes to file every 10 s."""

    def __init__(self, max_lines: int = 500, filepath: Path | None = None):
        super().__init__(TRACE)
        self._buf: collections.deque[str] = collections.deque(maxlen=max_lines)
        self._filepath = filepath
        self._lock = threading.Lock()
        self._dirty = False
        self._fmt = _PlainFmt()
        threading.Thread(target=self._flush_loop, daemon=True).start()

    def _flush_loop(self):
        import time
        while True:
            time.sleep(10)
            self._flush()

    def emit(self, record: logging.LogRecord):
        try:
            line = self._fmt.format(record)
        except Exception:
            line = record.getMessage()
        with self._lock:
            self._buf.append(line)
            self._dirty = True

    def get_tail(self, n: int | None = None) -> list[str]:
        with self._lock:
            lines = list(self._buf)
        return lines[-n:] if (n is not None and n < len(lines)) else lines

    @property
    def max_lines(self) -> int:
        return self._buf.maxlen or 0

    def set_max_lines(self, n: int):
        with self._lock:
            self._buf = collections.deque(self._buf, maxlen=n)

    def _flush(self):
        if not self._filepath or not self._dirty:
            return
        with self._lock:
            content = '\n'.join(self._buf)
            self._dirty = False
        try:
            self._filepath.write_text(content + '\n', encoding='utf-8')
        except Exception:
            pass


# ── Config persistence ─────────────────────────────────────────────────────────
_HERE = Path(__file__).parent
_CONFIG_FILE = _HERE / "logging_config.json"
_LOG_FILE    = _HERE / "backend.log"

_LEVEL_MAP: dict[str, int] = {
    "TRACE":    TRACE,
    "DEBUG":    logging.DEBUG,
    "INFO":     logging.INFO,
    "WARNING":  logging.WARNING,
    "ERROR":    logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}
_LEVEL_NAME_MAP: dict[int, str] = {v: k for k, v in _LEVEL_MAP.items()}

_DEFAULT_CONFIG = {"level": "INFO", "file_max_lines": 500}


def _load_config() -> dict:
    if _CONFIG_FILE.exists():
        try:
            data = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
            level = data.get("level", "INFO")
            if level not in _LEVEL_MAP:
                level = "INFO"
            return {
                "level": level,
                "file_max_lines": int(data.get("file_max_lines", 500)),
            }
        except Exception:
            pass
    return dict(_DEFAULT_CONFIG)


def _save_config(cfg: dict):
    try:
        _CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except Exception:
        pass


# ── Handlers ───────────────────────────────────────────────────────────────────
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_ColorFmt())
_console_handler.setLevel(TRACE)

_cfg = _load_config()
_ring_buffer = RingBufferHandler(max_lines=_cfg["file_max_lines"], filepath=_LOG_FILE)

logging.root.handlers = [_console_handler, _ring_buffer]

# ══════════════════════════════════════════════════════════════════════════════
# УРОВЕНЬ ЛОГА — меняй здесь или через API /logging/config (без перезапуска).
#
# Доступные уровни (от самого тихого к самому подробному):
#
#   logging.CRITICAL  — только критические ошибки (приложение падает)
#   logging.ERROR     — ошибки, из-за которых запрос не выполнился
#   logging.WARNING   — предупреждения (что-то подозрительное, но работает)
#   logging.INFO      — наши рабочие логи (старт задач, AI-анализ, сканирование)
#   logging.DEBUG     — всё выше + каждый HTTP-запрос от uvicorn (шумно)
#   TRACE (= 5)       — всё выше + thumbnail + polling endpoints (очень шумно)
#
# Рекомендуемые режимы:
#   logging.INFO   → продакшн / нормальная работа (чисто, только важное)
#   logging.DEBUG  → отладка API (видны все HTTP-запросы, кроме thumbnail/polling)
#   TRACE          → отладка thumbnail-пайплайна (максимальный шум)
# ══════════════════════════════════════════════════════════════════════════════
logging.root.setLevel(_LEVEL_MAP[_cfg["level"]])

# httpx/httpcore генерируют очень много DEBUG-мусора при каждом запросе к compute
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger("api")


# ── Public API ────────────────────────────────────────────────────────────────

def get_log_config() -> dict:
    """Return current logging config as a serializable dict."""
    return {
        "level": _LEVEL_NAME_MAP.get(logging.root.level, "INFO"),
        "file_max_lines": _ring_buffer.max_lines,
    }


def configure_logging(cfg: dict):
    """Apply new logging config live (no restart needed). Persists to disk."""
    level_name = cfg.get("level", "INFO")
    level = _LEVEL_MAP.get(level_name, logging.INFO)
    max_lines = max(50, int(cfg.get("file_max_lines", 500)))

    logging.root.setLevel(level)
    _ring_buffer.set_max_lines(max_lines)
    _save_config({"level": level_name, "file_max_lines": max_lines})
    logger.info("Log config updated: level=%s  file_max_lines=%d", level_name, max_lines)


def get_log_tail(n: int | None = None) -> list[str]:
    """Return last n lines from the in-memory ring buffer."""
    return _ring_buffer.get_tail(n)
