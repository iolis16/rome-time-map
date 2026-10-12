"""Cut a plain-WGS84 GeoTIFF (no rotation) into 512px XYZ WebP tiles.

Usage (isolated mode; the TIFF is an untrusted download):
    python3 -I data/tile_map.py SRC.tif OUT_DIR X0 Y0 X1 Y1 [ZMIN ZMAX]

X0..Y1 are the crop box as fractions (0-1) of the source image, used to drop
paper margins, legends and title blocks. Georeferencing is read from the
GeoTIFF ModelPixelScale / ModelTiepoint tags. Prints the bounds of the cropped
image as "west south east north" for use as the MapLibre source `bounds`.

Tiles outside the image are skipped; pixels outside it are transparent.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TILE = 512


def main(src, out_dir, fx0, fy0, fx1, fy1, zmin=11, zmax=16):
    im = Image.open(src)
    tags = im.tag_v2
    scale_x, scale_y, _ = tags[33550]
    _, _, _, west0, north0, _ = tags[33922]
    if abs(scale_x - scale_y) > 1e-12:
        sys.exit("non-square pixels not supported")
    w, h = im.size
    x0, y0, x1, y1 = round(fx0 * w), round(fy0 * h), round(fx1 * w), round(fy1 * h)
    img = im.convert("RGB").crop((x0, y0, x1, y1))
    s = scale_x
    west, north = west0 + x0 * s, north0 - y0 * s
    east, south = west + img.width * s, north - img.height * s
    print(f"{west:.6f} {south:.6f} {east:.6f} {north:.6f}  ({img.width}x{img.height}px)")

    pyramid = {1: np.asarray(img)}

    def level(f):
        if f not in pyramid:
            pyramid[f] = np.asarray(img.reduce(f))
        return pyramid[f]

    out = Path(out_dir)
    total = 0
    for z in range(zmin, zmax + 1):
        n = 2 ** z
        deg_per_px = 360 / (TILE * n)
        f = 2 ** max(0, int(math.floor(math.log2(deg_per_px / s))))
        arr = level(f)
        lh, lw = arr.shape[:2]

        def tx_of(lon):
            return int((lon + 180) / 360 * n)

        def ty_of(lat):
            return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)

        count = 0
        for tx in range(tx_of(west), tx_of(east) + 1):
            lon = (tx + (np.arange(TILE) + 0.5) / TILE) / n * 360 - 180
            sx = (lon - west) / s / f
            cols = np.floor(sx).astype(int)
            col_ok = (cols >= 0) & (cols < lw)
            for ty in range(ty_of(north), ty_of(south) + 1):
                merc = np.pi * (1 - 2 * (ty + (np.arange(TILE) + 0.5) / TILE) / n)
                lat = np.degrees(np.arctan(np.sinh(merc)))
                rows = np.floor((north - lat) / s / f).astype(int)
                row_ok = (rows >= 0) & (rows < lh)
                if not (row_ok.any() and col_ok.any()):
                    continue
                rgb = arr[np.clip(rows, 0, lh - 1)[:, None], np.clip(cols, 0, lw - 1)[None, :]]
                alpha = (row_ok[:, None] & col_ok[None, :]).astype(np.uint8) * 255
                rgba = np.dstack([rgb, alpha])
                path = out / str(z) / str(tx) / f"{ty}.webp"
                path.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=72, method=6)
                count += 1
        total += count
        print(f"z{z}: {count} tiles (source reduced {f}x)")
    size = sum(p.stat().st_size for p in out.rglob("*.webp"))
    print(f"{total} tiles, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) not in (6, 8):
        sys.exit(__doc__)
    main(a[0], a[1], *map(float, a[2:6]), *map(int, a[6:]))
