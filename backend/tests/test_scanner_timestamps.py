"""Rule: README "Filename timestamp patterns supported" — Foscam snapshot and
record filename patterns are parsed into UTC timestamps; anything else falls
back to file mtime (i.e. the parser returns None)."""
from datetime import datetime, timezone

from scanner import _timestamp_from_filename


def test_foscam_snapshot_pattern():
    dt = _timestamp_from_filename("MDAlarm_20231127-200442.jpg")
    assert dt == datetime(2023, 11, 27, 20, 4, 42, tzinfo=timezone.utc)


def test_foscam_record_pattern():
    dt = _timestamp_from_filename("alarm_20231127_200437.mkv")
    assert dt == datetime(2023, 11, 27, 20, 4, 37, tzinfo=timezone.utc)


def test_timestamp_is_utc():
    dt = _timestamp_from_filename("MDAlarm_20240101-000000.jpg")
    assert dt.tzinfo == timezone.utc


def test_invalid_calendar_date_returns_none():
    # month 13 / impossible time must not produce a bogus timestamp
    assert _timestamp_from_filename("MDAlarm_20231399-256199.jpg") is None


def test_unrecognized_name_returns_none():
    # None → scanner falls back to file mtime (README rule)
    assert _timestamp_from_filename("IMG_random_photo.jpg") is None
