#!/usr/bin/env python3
import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, rgba) -> None:
    raw = b""
    for y in range(height):
        raw += b"\x00"
        start = y * width
        for x in range(width):
            raw += bytes(rgba[start + x])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def clamp(n: float) -> int:
    return max(0, min(255, int(n)))


def icon(size: int):
    pixels = []
    cx = cy = size / 2
    r = size * 0.36
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            bg = (11, 16, 32, 255)
            if dist > size * 0.46:
                pixels.append(bg)
                continue
            # card body
            if abs(dx) < size * 0.28 and abs(dy) < size * 0.38:
                inside_ball = dist < r
                if inside_ball:
                    if abs(dy) < size * 0.035:
                        pixels.append((20, 20, 24, 255))
                    elif dy < 0:
                        pixels.append((232, 56, 64, 255))
                    else:
                        pixels.append((245, 246, 251, 255))
                else:
                    pixels.append((21, 27, 46, 255))
            else:
                pixels.append(bg)
        # center button
    out = []
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            px = pixels[y * size + x]
            if dist < size * 0.07:
                px = (255, 203, 5, 255)
            elif dist < size * 0.1:
                px = (20, 20, 24, 255)
            out.append(px)
    return out


def main() -> None:
    out = Path("public/icons")
    out.mkdir(parents=True, exist_ok=True)
    write_png(out / "icon-192.png", 192, 192, icon(192))
    write_png(out / "icon-512.png", 512, 512, icon(512))
    write_png(out / "apple-touch-icon.png", 180, 180, icon(180))
    print("wrote icons")


if __name__ == "__main__":
    main()
