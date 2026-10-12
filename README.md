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

## Data and attribution (planned)
- [Pleiades](https://pleiades.stoa.org/) — CC BY
- [Wikidata](https://www.wikidata.org/) — CC0
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors — ODbL; basemap tiles via [OpenFreeMap](https://openfreemap.org/)

Current `sites.geojson` is a 10-site seed set for development.
