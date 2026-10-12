"""Trace the Servian Wall from the pink line in Clarke's 1830 plan of ancient Rome.

Usage (isolated mode; the TIFF is an untrusted download):
    python3 -I data/trace_servian.py data/raw/x-ancient/g0890201.tif public/servian-traced.geojson

Method: threshold saturated pink pixels, close small gaps by dilation,
skeletonize, take the longest path through each connected component, simplify,
and convert pixel positions to lon/lat with the GeoTIFF tags. The result is
Clarke's *reconstruction* of the circuit, so it is approximate (a few metres of
trace error plus whatever Clarke got wrong) and is flagged as such.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import breadth_first_order, shortest_path
from skimage.color import rgb2hsv
from skimage.measure import approximate_polygon
from skimage.morphology import disk, skeletonize

Image.MAX_IMAGE_PIXELS = None
CROP = (0.037, 0.037, 0.975, 0.915)  # same neatline crop as tile_map.py
MIN_COMPONENT_PX = 120  # drop specks of pink text
DILATE_RADIUS = 7  # bridges gaps up to ~14 px (~12 m)
SIMPLIFY_PX = 2.0


def longest_path(skel):
    ys, xs = np.nonzero(skel)
    n = len(ys)
    index = -np.ones(skel.shape, dtype=np.int64)
    index[ys, xs] = np.arange(n)
    rows, cols = [], []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ny, nx = ys + dy, xs + dx
            ok = (ny >= 0) & (ny < skel.shape[0]) & (nx >= 0) & (nx < skel.shape[1])
            nb = np.full(n, -1)
            nb[ok] = index[ny[ok], nx[ok]]
            keep = nb >= 0
            rows.append(np.arange(n)[keep])
            cols.append(nb[keep])
    g = coo_matrix((np.ones(sum(len(r) for r in rows)), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()
    far = breadth_first_order(g, 0, directed=False, return_predecessors=False)[-1]
    dist, pred = shortest_path(g, directed=False, indices=far, return_predecessors=True)
    dist[~np.isfinite(dist)] = -1
    end = int(np.argmax(dist))
    path = [end]
    while pred[path[-1]] >= 0:
        path.append(int(pred[path[-1]]))
    return np.column_stack([ys[path], xs[path]]).astype(float)


def main(src, out):
    im = Image.open(src)
    tags = im.tag_v2
    scale = tags[33550][0]
    _, _, _, west0, north0, _ = tags[33922]
    w, h = im.size
    x0, y0, x1, y1 = round(CROP[0] * w), round(CROP[1] * h), round(CROP[2] * w), round(CROP[3] * h)
    hsv = rgb2hsv(np.asarray(im.convert("RGB").crop((x0, y0, x1, y1))))
    hue, sat, val = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    mask = ((hue > 325) | (hue < 10)) & (sat > 0.45) & (val > 0.6)
    mask = ndi.binary_dilation(mask, structure=disk(DILATE_RADIUS))
    labels, n = ndi.label(mask, structure=np.ones((3, 3)))
    sizes = ndi.sum(mask, labels, range(1, n + 1))
    feats = []
    for lab, size in enumerate(sizes, start=1):
        if size < MIN_COMPONENT_PX * DILATE_RADIUS:
            continue
        skel = skeletonize(labels == lab)
        if skel.sum() < MIN_COMPONENT_PX:
            continue
        path = approximate_polygon(longest_path(skel), SIMPLIFY_PX)
        coords = [[round(west0 + (x0 + x) * scale, 6), round(north0 - (y0 + y) * scale, 6)] for y, x in path]
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"wall": "servian", "name": "Servian Wall (Clarke 1830 reconstruction)",
                           "start_year": -378, "certainty": "reconstructed", "source": "clarke-1830-trace"},
        })
    Path(out).write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    print(f"{n} pink components, kept {len(feats)} traces, {sum(len(f['geometry']['coordinates']) for f in feats)} vertices")
    print(f"wrote {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
