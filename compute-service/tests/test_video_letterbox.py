"""Rule: docs/compute-service.md video thumbnails — frames are resized to the
exact target size with aspect ratio preserved and black letterboxing, never
stretched."""
from PIL import Image

from video import _resize_to


def test_exact_aspect_fills_canvas():
    src = Image.new("RGB", (800, 600), (255, 255, 255))
    out = _resize_to(src, 400, 300)
    assert out.size == (400, 300)
    assert out.getpixel((0, 0)) == (255, 255, 255)  # no letterbox needed


def test_square_source_gets_side_letterbox():
    src = Image.new("RGB", (400, 400), (255, 255, 255))
    out = _resize_to(src, 400, 300)
    assert out.size == (400, 300)
    # scaled to 300×300, centered: 50 px black bars on left/right
    assert out.getpixel((0, 150)) == (0, 0, 0)
    assert out.getpixel((49, 150)) == (0, 0, 0)
    assert out.getpixel((50, 150)) == (255, 255, 255)
    assert out.getpixel((200, 150)) == (255, 255, 255)
    assert out.getpixel((399, 150)) == (0, 0, 0)


def test_wide_source_gets_top_bottom_letterbox():
    src = Image.new("RGB", (800, 200), (255, 255, 255))
    out = _resize_to(src, 400, 300)
    assert out.size == (400, 300)
    # scaled to 400×100, centered vertically: 100 px black bars top/bottom
    assert out.getpixel((200, 0)) == (0, 0, 0)
    assert out.getpixel((200, 150)) == (255, 255, 255)
    assert out.getpixel((200, 299)) == (0, 0, 0)
