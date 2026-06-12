"""Rules: docs/code-map.md (task_executors/common.py) — SpeedTracker is a
sliding-window items/sec tracker; parse_dt returns timezone-aware UTC."""
from datetime import timezone

import task_executors.common as tc
from task_executors.common import SpeedTracker, parse_dt


def test_speed_needs_two_events():
    t = SpeedTracker(60)
    assert t.speed() is None
    t.record(1)
    assert t.speed() is None


def test_speed_is_delta_count_over_delta_time(monkeypatch):
    clock = iter([0.0, 10.0])
    monkeypatch.setattr(tc.time, "time", lambda: next(clock))
    t = SpeedTracker(60)
    t.record(0)
    t.record(50)
    assert t.speed() == 5.0  # 50 items / 10 s


def test_old_events_fall_out_of_window(monkeypatch):
    times = iter([0.0, 100.0, 105.0])
    monkeypatch.setattr(tc.time, "time", lambda: next(times))
    t = SpeedTracker(10)
    t.record(0)     # t=0   — outside the 10 s window by t=105
    t.record(100)   # t=100
    t.record(110)   # t=105
    assert t.speed() == 2.0  # (110-100) / (105-100), not (110-0)/105


def test_window_has_minimum_10s():
    t = SpeedTracker(1)
    assert t._window == 10.0


def test_parse_dt_z_suffix_and_naive():
    dt = parse_dt("2024-06-01T12:00:00Z")
    assert dt.tzinfo is not None and dt.utcoffset().total_seconds() == 0

    naive = parse_dt("2024-06-01T12:00:00")
    assert naive.tzinfo == timezone.utc

    assert parse_dt(None) is None
    assert parse_dt("") is None
