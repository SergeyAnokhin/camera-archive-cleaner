"""Rule: docs/api.md /delete/preview — deleting photos auto-matches paired
videos of the same camera within ±5 seconds; already-selected and other-camera
videos are excluded; no duplicates."""
from database import upsert_file
from routers.delete import PreviewRequest, delete_preview


def _add(conn, cam, ftype, name, ts):
    upsert_file(conn, cam, ftype, f"/t/del_match_{name}", 10, ts)
    conn.commit()
    return conn.execute("SELECT id FROM files WHERE file_path = ?", (f"/t/del_match_{name}",)).fetchone()["id"]


def test_videos_within_5_seconds_matched(db_conn):
    photo = _add(db_conn, "cam1", "photo", "p.jpg",  "2024-03-10T12:00:10+00:00")
    v_in  = _add(db_conn, "cam1", "video", "v1.mkv", "2024-03-10T12:00:13+00:00")  # +3 s
    v_edge = _add(db_conn, "cam1", "video", "v2.mkv", "2024-03-10T12:00:05+00:00")  # -5 s exactly
    v_out = _add(db_conn, "cam1", "video", "v3.mkv", "2024-03-10T12:00:17+00:00")  # +7 s

    res = delete_preview(PreviewRequest(file_ids=[photo]))
    related = {v["id"] for v in res["related_videos"]}
    assert v_in in related
    assert v_edge in related
    assert v_out not in related


def test_other_camera_video_not_matched(db_conn):
    photo = _add(db_conn, "cam1", "photo", "p2.jpg", "2024-03-10T12:00:10+00:00")
    other = _add(db_conn, "cam2", "video", "v4.mkv", "2024-03-10T12:00:11+00:00")

    res = delete_preview(PreviewRequest(file_ids=[photo]))
    assert other not in {v["id"] for v in res["related_videos"]}


def test_selected_video_not_duplicated(db_conn):
    photo = _add(db_conn, "cam1", "photo", "p3.jpg", "2024-03-10T12:00:10+00:00")
    video = _add(db_conn, "cam1", "video", "v5.mkv", "2024-03-10T12:00:11+00:00")

    # video already in the selection → must not reappear as "related"
    res = delete_preview(PreviewRequest(file_ids=[photo, video]))
    assert video not in {v["id"] for v in res["related_videos"]}
    assert {s["id"] for s in res["selected"]} == {photo, video}


def test_two_photos_share_one_video_no_duplicates(db_conn):
    p1 = _add(db_conn, "cam1", "photo", "p4.jpg", "2024-03-10T12:00:10+00:00")
    p2 = _add(db_conn, "cam1", "photo", "p5.jpg", "2024-03-10T12:00:12+00:00")
    v  = _add(db_conn, "cam1", "video", "v6.mkv", "2024-03-10T12:00:11+00:00")

    res = delete_preview(PreviewRequest(file_ids=[p1, p2]))
    ids = [x["id"] for x in res["related_videos"]]
    assert ids.count(v) == 1
