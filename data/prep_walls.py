"""Build public/walls.geojson from the Overpass response in data/raw/walls.json.

Usage (isolated mode, since data/raw holds untrusted downloads):
    python3 -I data/prep_walls.py data/raw/walls.json public/walls.geojson

Fetch the input with data/walls.overpassql, e.g.:
    curl -X POST https://overpass.openstreetmap.fr/api/interpreter \
      --data-urlencode data@data/walls.overpassql -o data/raw/walls.json

Walls are classified by OSM name. start_year is when construction began (the
walls are shown from then on; Servian remnants remain visible in later eras).
"""
import json
import sys
from collections import Counter
from pathlib import Path

WALLS = {
    "servian": {"label": "Servian Wall", "start_year": -378, "note": "Stone wall begun after the Gallic sack (traditional date)."},
    "aurelian": {"label": "Aurelian Wall", "start_year": 271, "note": "Begun under Aurelian; still largely standing."},
    "leonine": {"label": "Leonine Wall", "start_year": 848, "note": "Built by Pope Leo IV to enclose the Vatican."},
}


def classify(name):
    n = name.lower()
    if "aurelian" in n:
        return "aurelian"
    if "servian" in n:
        return "servian"
    if "leonin" in n:
        return "leonine"
    return None


def main(src, out):
    elements = json.loads(Path(src).read_text())["elements"]
    feats, skipped = [], Counter()
    for e in elements:
        kind = classify(e.get("tags", {}).get("name", ""))
        geom = e.get("geometry")
        if kind is None or not geom or len(geom) < 2:
            skipped["unclassified or empty"] += 1
            continue
        w = WALLS[kind]
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [[round(p["lon"], 6), round(p["lat"], 6)] for p in geom]},
            "properties": {"wall": kind, "name": w["label"], "start_year": w["start_year"], "osm_id": e["id"]},
        })
    Path(out).write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    print(f"{len(feats)} segments {dict(Counter(f['properties']['wall'] for f in feats))}, skipped {dict(skipped)}")
    print(f"wrote {out} ({Path(out).stat().st_size // 1024} KB)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
