"""Build public/sites.geojson from the raw Wikidata and Pleiades downloads.

Usage (isolated mode, since data/raw holds untrusted downloads):
    python3 -I data/prep.py data/raw public/sites.geojson

Date model
  start_year / end_year are signed integers (BC negative). end_year is omitted
  when the site is still standing. date_precision says how much to trust
  start_year:
    year | decade | century  - Wikidata inception, at its stated precision
    period                   - Pleiades only gives period buckets (e.g. "Roman"
                               = -30), so start_year is the bucket start, not a
                               construction date.
  Wikidata wins whenever both sources describe the same place.
"""
import difflib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

BBOX = dict(lon=(12.38, 12.60), lat=(41.81, 41.97))
MERGE_RADIUS_M = 60
SAME_NAME_RADIUS_M = 3000  # long features (walls, roads) have centroids far apart
OPEN_ENDED = 2000  # Pleiades uses 2099/2100 for "still extant"

PRECISION = {"7": "century", "8": "decade", "9": "year", "10": "year", "11": "year"}

# First match wins, so order matters.
TYPE_RULES = [
    ("funerary", ["tomb", "cemetery", "catacomb", "mausoleum", "necropolis", "columbarium", "sepulch", "grave"]),
    ("entertainment", ["theatre", "theater", "amphitheat", "stadi", "circus", "arena", "odeon", "naumachia", "hippodrome"]),
    ("religious", ["church", "basilica", "temple", "chapel", "sanctuary", "cathedral", "abbey", "monaster",
                   "convent", "mosque", "synagogue", "shrine", "oratory", "baptist", "religious", "cloister", "sacred"]),
    ("infrastructure", ["bridge", "aqueduct", "road", "street", "gate", "wall", "fountain", "cistern", "harbo",
                        "port", "sewer", "drain", "fort", "tower", "lighthouse", "canal", "nymphae"]),
    ("residential", ["villa", "domus", "townhouse", "palace", "palazzo", "house", "insula", "garden", "horti", "residen"]),
    ("civic", ["forum", "bath", "thermae", "museum", "monument", "arch", "column", "obelisk", "statue", "sculpture",
               "memorial", "library", "market", "curia", "senate", "government", "town hall", "building",
               "architectural", "complex", "archaeological", "ancient roman structure", "ruin"]),
]
WIKIDATA_CLASS_BLACKLIST = ["organ", "painting", "musical instrument", "manuscript", "relief", "tapestry", "fresco"]
PLEIADES_DROP = {"unlocated", "region", "hill", "river", "island", "valley", "mountain", "plain", "province",
                 "people", "findspot", "territory", "promontory", "lake", "spring", "false", "undefined"}

FILLER = re.compile(r"\b(of|di|del|della|dei|delle|degli|the|and|e|ai|al|alla|santa|santo|san|sant|saint|st|church|chiesa|"
                    r"basilica|roman|rome|roma|temple|tempio)\b")


def classify(labels):
    text = " ".join(labels).lower()
    for type_, keys in TYPE_RULES:
        if any(k in text for k in keys):
            return type_
    return "other"


def norm(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", FILLER.sub(" ", s)).strip()


def similar(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na in nb or nb in na:
        return True
    ta = {t for t in na.split() if len(t) > 3}
    tb = {t for t in nb.split() if len(t) > 3}
    return bool(ta & tb) or difflib.SequenceMatcher(None, na, nb).ratio() > 0.7


def year_of(iso):
    m = re.match(r"^(-?\d+)-", iso)
    return int(m.group(1)) if m else None


def feature(name, lon, lat, props):
    props = {"name": name, **{k: v for k, v in props.items() if v is not None}}
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, "properties": props}


def load_wikidata(path):
    rows = json.loads(Path(path).read_text())["results"]["bindings"]
    items = defaultdict(lambda: {"classes": set()})
    for r in rows:
        qid = r["item"]["value"].rsplit("/", 1)[-1]
        it = items[qid]
        it["name"] = r["itemLabel"]["value"]
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["coord"]["value"])
        it["lon"], it["lat"] = float(m.group(1)), float(m.group(2))
        it["start"] = year_of(r["inception"]["value"])
        it["prec"] = PRECISION.get(r["prec"]["value"], "year")
        if "dissolved" in r:
            it["end"] = year_of(r["dissolved"]["value"])
        if "article" in r:
            it["article"] = r["article"]["value"]
        if "classLabel" in r:
            it["classes"].add(r["classLabel"]["value"])

    feats, dropped = [], Counter()
    for qid, it in items.items():
        if re.fullmatch(r"Q\d+", it["name"]):
            dropped["unlabelled"] += 1
            continue
        if any(b in c.lower() for c in it["classes"] for b in WIKIDATA_CLASS_BLACKLIST):
            dropped["blacklisted class"] += 1
            continue
        if it["start"] is None or it["start"] > 2025:
            dropped["bad date"] += 1
            continue
        end = it.get("end")
        if end is not None and end < it["start"]:
            end = None
        feats.append(feature(it["name"], it["lon"], it["lat"], {
            "type": classify(it["classes"] or [it["name"]]),
            "start_year": it["start"],
            "end_year": end,
            "date_precision": it["prec"],
            "source": "wikidata",
            "id": qid,
            "wikipedia_url": it.get("article"),
        }))
    return feats, dropped


def load_pleiades(path):
    df = pd.read_csv(path, usecols=["id", "title", "reprLat", "reprLong", "minDate", "maxDate", "featureTypes", "description"],
                     low_memory=False)
    df = df[df.reprLong.between(*BBOX["lon"]) & df.reprLat.between(*BBOX["lat"]) & df.minDate.notna()]
    feats, dropped = [], Counter()
    for r in df.itertuples():
        kinds = [k.strip() for k in str(r.featureTypes).split(",") if k.strip()]
        if not kinds or all(k in PLEIADES_DROP for k in kinds):
            dropped["non-site feature type"] += 1
            continue
        end = None if r.maxDate >= OPEN_ENDED else int(r.maxDate)
        desc = r.description if isinstance(r.description, str) else None
        feats.append(feature(r.title, r.reprLong, r.reprLat, {
            "type": classify(kinds),
            "start_year": int(r.minDate),
            "end_year": end,
            "date_precision": "period",
            "source": "pleiades",
            "id": str(r.id),
            "description": desc[:220].rsplit(" ", 1)[0] + "…" if desc and len(desc) > 220 else desc,
        }))
    return feats, dropped


def haversine_m(lon, lat, lons, lats):
    p1, p2 = np.radians(lat), np.radians(lats)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lons - lon) / 2) ** 2
    return 6371000 * 2 * np.arcsin(np.sqrt(a))


def merge(primary, secondary):
    """Return secondary features that don't duplicate anything in primary."""
    coords = np.array([f["geometry"]["coordinates"] for f in primary])
    kept, dups = [], 0
    for f in secondary:
        lon, lat = f["geometry"]["coordinates"]
        dist = haversine_m(lon, lat, coords[:, 0], coords[:, 1])
        near = np.where(dist <= MERGE_RADIUS_M)[0]
        name = norm(f["properties"]["name"])
        same_name = len(name) >= 8 and any(
            norm(primary[i]["properties"]["name"]) == name for i in np.where(dist <= SAME_NAME_RADIUS_M)[0])
        if same_name or any(similar(f["properties"]["name"], primary[i]["properties"]["name"]) for i in near):
            dups += 1
        else:
            kept.append(f)
    return kept, dups


def report(feats):
    eras = [("Kingdom/early Republic", -753, -300), ("Republic", -299, -28), ("Early Empire", -27, 180),
            ("Late Empire", 181, 476), ("Medieval", 477, 1399), ("Renaissance/Baroque", 1400, 1799), ("Modern", 1800, 2025)]
    print(f"\n{len(feats)} features")
    print("by source:", dict(Counter(f["properties"]["source"] for f in feats)))
    print("by type:  ", dict(Counter(f["properties"]["type"] for f in feats).most_common()))
    print("by date precision:", dict(Counter(f["properties"]["date_precision"] for f in feats)))
    print("\nstanding at the midpoint of each era:")
    for name, a, b in eras:
        y = (a + b) // 2
        n = sum(1 for f in feats if f["properties"]["start_year"] <= y and
                (f["properties"].get("end_year") is None or f["properties"]["end_year"] >= y))
        print(f"  {name:24s} {y:>6d}  {n}")
    print("\nspot check:")
    for q in ["Colosseum", "Pantheon", "Roman Forum", "St. Peter", "Trevi", "Circus Maximus", "Baths of Caracalla",
              "Santa Maria Maggiore", "Arch of Septimius Severus", "Aurelian"]:
        hits = [f["properties"] for f in feats if q.lower() in f["properties"]["name"].lower()]
        if not hits:
            print(f"  {q}: NOT FOUND")
        for p in hits[:2]:
            print(f"  {p['name']}: {p['start_year']} ({p['date_precision']}, {p['source']}) {p['type']}")


def main(raw_dir, out_path):
    raw = Path(raw_dir)
    wd, wd_drop = load_wikidata(raw / "wikidata-rome.json")
    pl, pl_drop = load_pleiades(raw / "pleiades-places-latest.csv")
    print(f"wikidata: {len(wd)} kept, dropped {dict(wd_drop)}")
    print(f"pleiades: {len(pl)} in bbox with dates, dropped {dict(pl_drop)}")
    pl_new, dups = merge(wd, pl)
    print(f"pleiades: {dups} duplicates of wikidata sites removed, {len(pl_new)} added")
    feats = sorted(wd + pl_new, key=lambda f: (f["properties"]["start_year"], f["properties"]["name"]))
    Path(out_path).write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")))
    report(feats)
    print(f"\nwrote {out_path} ({Path(out_path).stat().st_size // 1024} KB)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
