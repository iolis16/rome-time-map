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

## Attribution
- [Pleiades](https://pleiades.stoa.org/) — CC BY
- [Wikidata](https://www.wikidata.org/) — CC0
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors — ODbL; basemap tiles via [OpenFreeMap](https://openfreemap.org/)
