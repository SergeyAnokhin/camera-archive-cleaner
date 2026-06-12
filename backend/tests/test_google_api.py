"""Pins the Gmail attachment-extraction and Drive path rules from docs/google-integration.md."""
import google_api


def _part(filename="", mime="text/plain", attachment_id=None, data=None, parts=None):
    p = {"filename": filename, "mimeType": mime, "body": {}}
    if attachment_id:
        p["body"]["attachmentId"] = attachment_id
    if data:
        p["body"]["data"] = data
    if parts:
        p["parts"] = parts
    return p


def test_extract_attachments_nested_multipart():
    """Photo/video parts are collected from any nesting depth; text parts are not."""
    payload = _part(mime="multipart/mixed", parts=[
        _part(mime="multipart/alternative", parts=[
            _part(mime="text/plain"),
            _part(mime="text/html"),
        ]),
        _part(filename="MDAlarm_20231127-200442.jpg", mime="image/jpeg", attachment_id="att1"),
        _part(filename="clip.mp4", mime="video/mp4", attachment_id="att2"),
    ])
    atts = google_api.extract_attachments(payload)
    assert [a["filename"] for a in atts] == ["MDAlarm_20231127-200442.jpg", "clip.mp4"]
    assert atts[0]["attachment_id"] == "att1"


def test_extract_attachments_octet_stream_by_extension():
    """Cameras often send application/octet-stream — the .jpg extension qualifies it."""
    payload = _part(mime="multipart/mixed", parts=[
        _part(filename="snap.jpg", mime="application/octet-stream", attachment_id="a"),
        _part(filename="report.pdf", mime="application/pdf", attachment_id="b"),
    ])
    atts = google_api.extract_attachments(payload)
    assert [a["filename"] for a in atts] == ["snap.jpg"]


def test_extract_attachments_inline_data():
    """Small attachments come inline as body.data instead of an attachmentId."""
    payload = _part(filename="tiny.png", mime="image/png", data="aGVsbG8=")
    atts = google_api.extract_attachments(payload)
    assert len(atts) == 1
    assert atts[0]["attachment_id"] is None
    assert atts[0]["data"] == "aGVsbG8="


def test_split_drive_path_normalizes():
    assert google_api.split_drive_path("A/B\\C//") == ["A", "B", "C"]
    assert google_api.split_drive_path("  Camera / Front ") == ["Camera", "Front"]
    assert google_api.split_drive_path("") == []
