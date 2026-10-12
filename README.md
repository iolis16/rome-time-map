# Rome Through Time

An interactive map of Rome's monuments and sites across ~2,800 years, with a time slider that shows what was standing in each era.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## Stack
Vite + vanilla JS + [MapLibre GL JS](https://maplibre.org/). Data is a single static `public/sites.geojson`, prepared by `data/prep.py` (in progress).

## Data

`public/sites.geojson` is generated, not hand-edited:

```bash
# 1. Download raw data into data/raw/ (gitignored)
curl -L -O --output-dir data/raw https://atlantides.org/downloads/pleiades/dumps/pleiades-places-latest.csv.gz
gunzip -k data/raw/pleiades-places-latest.csv.gz
curl -sG https://query.wikidata.org/sparql -H "Accept: application/sparql-results+json" \
  -H "User-Agent: rome-time-map/0.1 (github.com/iolis16/rome-time-map)" \
  --data-urlencode query@data/wikidata.rq -o data/raw/wikidata-rome.json
# 2. Build the GeoJSON (requires pandas, numpy)
python3 -I data/prep.py data/raw public/sites.geojson
```

**How dates work.** Wikidata supplies real inception dates (year, decade, or century precision) and wins when both sources describe the same place. Pleiades only provides *period buckets* (e.g. "Roman" starts at 30 BC), so those sites carry `date_precision: "period"` and are drawn faded on the map; their start year is the start of the period, not a construction date.

### City walls

`public/walls.geojson` comes from OpenStreetMap via Overpass (`data/walls.overpassql`, then `data/prep_walls.py`). Coverage is partial: the Aurelian Wall is ~80% mapped (~15 of ~19 km), while OSM has only ~1 km of the ~11 km Servian Wall (surviving fragments). The rest of the Servian circuit is **traced from the pink line in Clarke's 1830 plan** (`data/trace_servian.py`, saved as `data/servian-traced.geojson`) and drawn dashed. It is a 19th-century reconstruction plus trace error: surviving OSM fragments sit mostly 30–50 m from it, so treat it as good to roughly ±40 m. The traced line has gaps where Clarke's ink is faint or hidden under labels. Start dates: Servian 378 BC, Aurelian 271 AD, Leonine 848 AD.

## Historical maps

The map selector switches between georeferenced historical maps (Auto follows the slider):

| Map | Years shown | Source |
|---|---|---|
| Clarke, *Plan of ancient Rome* (1830), a scholarly reconstruction | 753 BC – 476 AD | Stanford `dy213ky1514`, tiled locally |
| Nolli, *Pianta Grande* (1748) | 1400 – 1799 | Stanford `nn217br6628`, remote XYZ tiles |
| Clarke, *Plan of modern Rome* (1830) | 1800 – 2025 | Stanford `qs159bn5216`, tiled locally |

The Clarke tiles in `public/tiles/` were made from the Stanford GeoTIFFs with `data/tile_map.py` (Pillow + NumPy, no GDAL):

```bash
curl -L -o data/raw/dy213ky1514.zip https://stacks.stanford.edu/object/dy213ky1514.zip   # ~285 MB
unzip -j data/raw/dy213ky1514.zip g0890201.tif -d data/raw/x-ancient
python3 -I data/tile_map.py data/raw/x-ancient/g0890201.tif public/tiles/clarke-ancient 0.037 0.037 0.975 0.915
```
(`qs159bn5216` / `g0890202.tif` / `clarke-modern` for the modern map.) The crop box removes paper margins; the title block, legend and elevation drawings inside the frame remain, so use the opacity slider.

## Attribution
- [Pleiades](https://pleiades.stoa.org/) — CC BY
- [Wikidata](https://www.wikidata.org/) — CC0
- [La Pianta Grande di Roma (Nolli, 1748), georeferenced](https://purl.stanford.edu/nn217br6628) — University of Oregon / Stanford CSTA, CC BY-NC-SA 4.0 (non-commercial use only)
- W. B. Clarke, [Plan of ancient Rome](https://purl.stanford.edu/dy213ky1514) and [Plan of modern Rome](https://purl.stanford.edu/qs159bn5216), 1830 — David Rumsey Map Collection, courtesy Stanford University Libraries, CC BY-NC-SA 3.0. Changes: cropped and retiled.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors — ODbL; basemap tiles via [OpenFreeMap](https://openfreemap.org/)
