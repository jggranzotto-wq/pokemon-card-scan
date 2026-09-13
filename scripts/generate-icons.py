#!/usr/bin/env python3
"""Store-safe TCG Card Scan icons. No Nintendo / Pokémon marks."""
import struct
import zlib
from pathlib import Path


NAVY = (11, 16, 32, 255)
CARD = (21, 27, 46, 255)
CARD_EDGE = (42, 52, 82, 255)
GOLD = (255, 203, 5, 255)
LINE = (154, 163, 184, 255)


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, rgba) -> None:
    raw = bytearray()
    row_width = width
    for y in range(height):
        raw.append(0)
        start = y * row_width
        for pixel in rgba[start : start + row_width]:
            raw.extend(pixel)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")
    )


def in_round_rect(dx: float, dy: float, hw: float, hh: float, r: float) -> bool:
    ax, ay = abs(dx), abs(dy)
    if ax <= hw - r and ay <= hh:
        return True
    if ay <= hh - r and ax <= hw:
        return True
    if ax > hw or ay > hh:
        return False
    return (ax - (hw - r)) ** 2 + (ay - (hh - r)) ** 2 <= r * r


def near_bracket(dx: float, dy: float, hw: float, hh: float, thickness: float, length: float) -> bool:
    ax, ay = abs(dx), abs(dy)
    on_v = hw - thickness <= ax <= hw + thickness * 0.35 and hh - length <= ay <= hh + thickness * 0.35
    on_h = hh - thickness <= ay <= hh + thickness * 0.35 and hw - length <= ax <= hw + thickness * 0.35
    return on_v or on_h


def icon_pixels(size: int, *, background=NAVY):
    pixels = []
    cx = cy = size / 2
    hw, hh = size * 0.26, size * 0.36
    radius = size * 0.045
    scan_y = size * 0.02
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            if in_round_rect(dx, dy, hw, hh, radius):
                if in_round_rect(dx, dy, hw - size * 0.018, hh - size * 0.018, radius * 0.7):
                    px = CARD
                    if abs(dy) < size * 0.012:
                        px = GOLD
                    elif abs(dy - scan_y) < size * 0.006:
                        px = LINE
                    elif abs(dx) < size * 0.14 and -hh * 0.45 < dy < -hh * 0.15:
                        px = (32, 40, 64, 255)
                    elif abs(dx) < size * 0.16 and hh * 0.08 < dy < hh * 0.42:
                        if abs(dx) < size * 0.11:
                            px = (28, 35, 56, 255)
                else:
                    px = CARD_EDGE
            else:
                px = background
            if near_bracket(dx, dy, hw + size * 0.035, hh + size * 0.035, size * 0.028, size * 0.11):
                px = GOLD
            pixels.append(px)
    return pixels


def splash_pixels(width: int, height: int, mark, mark_size: int):
    pixels = [NAVY] * (width * height)
    ox = (width - mark_size) // 2
    oy = (height - mark_size) // 2
    for y in range(mark_size):
        dest = (oy + y) * width + ox
        src = y * mark_size
        pixels[dest : dest + mark_size] = mark[src : src + mark_size]
    return pixels


def write_android_res(android_res: Path) -> None:
    mipmap = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    for density, size in mipmap.items():
        px = icon_pixels(size)
        write_png(android_res / f"mipmap-{density}" / "ic_launcher.png", size, size, px)
        write_png(android_res / f"mipmap-{density}" / "ic_launcher_round.png", size, size, px)
        write_png(android_res / f"mipmap-{density}" / "ic_launcher_foreground.png", size, size, px)

    adaptive = icon_pixels(432, background=(0, 0, 0, 0))
    write_png(android_res / "mipmap-xxxhdpi" / "ic_launcher_foreground.png", 432, 432, adaptive)
    write_png(android_res / "drawable" / "ic_launcher_foreground.png", 432, 432, adaptive)
    write_png(android_res / "drawable" / "splash.png", 288, 288, icon_pixels(288, background=NAVY))

    mark = icon_pixels(256, background=NAVY)
    for folder, width, height in (
        ("drawable-port-mdpi", 320, 480),
        ("drawable-port-hdpi", 480, 800),
        ("drawable-port-xhdpi", 720, 1280),
        ("drawable-land-mdpi", 480, 320),
        ("drawable-land-hdpi", 800, 480),
        ("drawable-land-xhdpi", 1280, 720),
    ):
        write_png(android_res / folder / "splash.png", width, height, splash_pixels(width, height, mark, 256))

    # Larger densities reuse the xhdpi art; delete Capacitor's leftover logo if present.
    for leftover in (
        "drawable-port-xxhdpi/splash.png",
        "drawable-port-xxxhdpi/splash.png",
        "drawable-land-xxhdpi/splash.png",
        "drawable-land-xxxhdpi/splash.png",
    ):
        path = android_res / leftover
        if path.exists():
            path.unlink()


def main() -> None:
    public = Path("public/icons")
    write_png(public / "icon-192.png", 192, 192, icon_pixels(192))
    write_png(public / "icon-512.png", 512, 512, icon_pixels(512))
    write_png(public / "apple-touch-icon.png", 180, 180, icon_pixels(180))
    store = Path("store")
    mark = icon_pixels(256, background=NAVY)
    write_png(store / "icon-512.png", 512, 512, icon_pixels(512))
    write_png(store / "feature-graphic-2x1.png", 1024, 512, splash_pixels(1024, 512, mark, 256))
    android_res = Path("android/app/src/main/res")
    if android_res.exists():
        write_android_res(android_res)
        print("wrote public, store, and Android launcher/splash icons")
    else:
        print("wrote public and store icons (Android project not present yet)")


if __name__ == "__main__":
    main()
