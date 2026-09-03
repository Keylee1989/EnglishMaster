#!/usr/bin/env python3
"""Generate PWA icons as real PNG files (pure Python: zlib + struct, no PIL).

Creates icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon.png (180x180).
Design: dark blue rounded square, vertical gradient, white "EM" lettering
drawn from a scaled bitmap font.
"""
import struct
import zlib
import os


def make_png(width, height, pixel_fn):
    """pixel_fn(x, y) -> (r, g, b, a) with 0 <= x < width, 0 <= y < height."""
    rows = []
    for y in range(height):
        row = bytearray([0])  # filter type 0
        for x in range(width):
            r, g, b, a = pixel_fn(x, y)
            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


# ---- tiny 5x7 bitmap font for "E" and "M" ----
GLYPH_E = [
    "11111",
    "10000",
    "10000",
    "11110",
    "10000",
    "10000",
    "11111",
]
GLYPH_M = [
    "10001",
    "11011",
    "10101",
    "10001",
    "10001",
    "10001",
    "10001",
]


def rounded_rect_alpha(x, y, size, radius):
    """1.0 inside rounded rect, 0.0 outside, smooth-ish edge via 1px feather."""
    r = radius
    cx = min(max(x, r), size - 1 - r)
    cy = min(max(y, r), size - 1 - r)
    dx, dy = x - cx, y - cy
    dist = (dx * dx + dy * dy) ** 0.5
    # 1.5px anti-aliased edge
    aa = 0.5 * min(max(r - dist + 1.0, 0.0), 1.0)
    aa = max(aa, 0.0)
    return aa


def build_icon(size, with_letters=True):
    radius = int(size * 0.18)
    glyph_scale = max(1, size // 42)  # each font pixel -> glyph_scale px
    glyph_w = 5 * glyph_scale
    glyph_h = 7 * glyph_scale
    total_w = glyph_w * 2 + glyph_scale * 2  # "E" + gap + "M"
    x0 = (size - total_w) // 2
    y0 = (size - glyph_h) // 2

    def pixel(x, y):
        a = rounded_rect_alpha(x, y, size, radius)
        if a <= 0:
            return (0, 0, 0, 0)
        # vertical gradient: #2b7de9 -> #7c5cfc
        t = y / size
        r = int(43 + (124 - 43) * t)
        g = int(125 + (92 - 125) * t)
        b = int(233 + (252 - 233) * t)

        def glyph_px(glyph, gx, gy):
            row = glyph[gy // glyph_scale]
            return row[gx // glyph_scale] == "1"

        if with_letters:
            # E
            if 0 <= x - x0 < glyph_w and 0 <= y - y0 < glyph_h:
                if glyph_px(GLYPH_E, x - x0, y - y0):
                    return (255, 255, 255, 255)
            # M
            mx = x0 + glyph_w + glyph_scale
            if 0 <= x - mx < glyph_w and 0 <= y - y0 < glyph_h:
                if glyph_px(GLYPH_M, x - mx, y - y0):
                    return (255, 255, 255, 255)
        return (r, g, b, int(a * 255))

    return pixel


def write_icon(path, size, with_letters=True):
    png = make_png(size, size, build_icon(size, with_letters))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size}, {len(png)} bytes)")


if __name__ == "__main__":
    write_icon("icons/icon-192.png", 192)
    write_icon("icons/icon-512.png", 512)
    write_icon("icons/apple-touch-icon.png", 180)