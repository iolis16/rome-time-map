import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const ROME = [12.4839, 41.8967];
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
// Historical base maps. `from`/`to` are the slider years each one is shown for in Auto mode.
// Nolli: Univ. of Oregon / Stanford CSTA (CC BY-NC-SA 4.0). Clarke: David Rumsey Map Collection,
// courtesy Stanford University Libraries (CC BY-NC-SA 3.0); cropped and retiled by this project
// (see data/tile_map.py). Clarke's "ancient Rome" is a 1830 scholarly reconstruction, not a survey.
const HISTORICAL_MAPS = [
  {
    id: 'ancient',
    label: 'Ancient Rome (Clarke, 1830)',
    caption: "W. B. Clarke's 1830 plan of ancient Rome: a 19th-century reconstruction, not a survey.",
    tiles: '/tiles/clarke-ancient/{z}/{x}/{y}.webp',
    bounds: [12.44714, 41.872569, 12.52164, 41.913429],
    minzoom: 11,
    maxzoom: 16,
    from: -753,
    to: 476,
    attribution:
      '<a href="https://purl.stanford.edu/dy213ky1514" target="_blank" rel="noopener">Clarke 1830, David Rumsey Map Collection / Stanford, CC BY-NC-SA 3.0</a>',
  },
  {
    id: 'nolli',
    label: 'Rome in 1748 (Nolli)',
    caption: "Giambattista Nolli's 1748 Pianta Grande, the first accurate ground plan of Rome.",
    tiles: 'https://stacks.stanford.edu/file/nn217br6628/{z}/{x}/{y}.png',
    bounds: [12.441, 41.862, 12.527, 41.921],
    minzoom: 10,
    maxzoom: 18,
    from: 1400,
    to: 1799,
    attribution:
      '<a href="https://purl.stanford.edu/nn217br6628" target="_blank" rel="noopener">Nolli map: Univ. of Oregon / Stanford CSTA, CC BY-NC-SA 4.0</a>',
  },
  {
    id: 'modern',
    label: 'Rome in 1830 (Clarke)',
    caption: "W. B. Clarke's 1830 plan of modern Rome, just before unification and the railways.",
    tiles: '/tiles/clarke-modern/{z}/{x}/{y}.webp',
    bounds: [12.445194, 41.87252, 12.52006, 41.913572],
    minzoom: 11,
    maxzoom: 16,
    from: 1800,
    to: 2025,
    attribution:
      '<a href="https://purl.stanford.edu/qs159bn5216" target="_blank" rel="noopener">Clarke 1830, David Rumsey Map Collection / Stanford, CC BY-NC-SA 3.0</a>',
  },
];
const WALL_COLORS = { servian: '#8b5a2b', aurelian: '#444444', leonine: '#7a4b9a' };
const TYPE_COLORS = {
  religious: '#a4472b',
  civic: '#2f6f8f',
  entertainment: '#b8860b',
  residential: '#6a4c93',
  funerary: '#4a4a4a',
  infrastructure: '#2e8b57',
  other: '#8c8c8c',
};

const els = {
  slider: document.getElementById('slider'),
  year: document.getElementById('year-label'),
  eraName: document.getElementById('era-name'),
  eraBlurb: document.getElementById('era-blurb'),
  eras: document.getElementById('eras'),
  play: document.getElementById('play'),
  count: document.getElementById('count'),
  legend: document.getElementById('legend'),
  showAll: document.getElementById('show-all'),
  mapMode: document.getElementById('map-mode'),
  mapOpacity: document.getElementById('map-opacity'),
  mapOpacityValue: document.getElementById('map-opacity-value'),
  mapCaption: document.getElementById('map-caption'),
  wallsToggle: document.getElementById('walls-toggle'),
};

const formatYear = (y) => (y < 0 ? `${-y} BC` : y === 0 ? '1 BC' : `${y} AD`);

async function main() {
  const [eras, sites, walls] = await Promise.all([
    fetch('/eras.json').then((r) => r.json()),
    fetch('/sites.geojson').then((r) => r.json()),
    fetch('/walls.geojson').then((r) => r.json()),
  ]);

  const minYear = eras[0].start;
  const maxYear = eras[eras.length - 1].end;
  els.slider.min = minYear;
  els.slider.max = maxYear;
  els.slider.step = 1;
  els.slider.value = 100;

  const map = new maplibregl.Map({ container: 'map', style: STYLE, center: ROME, zoom: 13.5 });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  const colorExpr = ['match', ['get', 'type'], ...Object.entries(TYPE_COLORS).filter(([k]) => k !== 'other').flat(), TYPE_COLORS.other];

  const allTypes = Object.keys(TYPE_COLORS);
  const activeTypes = new Set(allTypes);

  function mapFilter(year) {
    return [
      'all',
      ['<=', ['get', 'start_year'], year],
      ['any', ['!', ['has', 'end_year']], ['>=', ['get', 'end_year'], year]],
      ['in', ['get', 'type'], ['literal', [...activeTypes]]],
    ];
  }

  const standing = (p, year) => p.start_year <= year && (p.end_year == null || p.end_year >= year);

  const legendCounts = {};
  for (const type of allTypes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'legend-item';
    b.setAttribute('aria-pressed', 'true');
    b.style.setProperty('--c', TYPE_COLORS[type]);
    b.innerHTML = '<span class="swatch"></span><span class="label"></span><span class="n"></span>';
    b.querySelector('.label').textContent = type;
    b.addEventListener('click', () => {
      if (!activeTypes.delete(type)) activeTypes.add(type);
      update(Number(els.slider.value));
    });
    legendCounts[type] = { button: b, n: b.querySelector('.n') };
    els.legend.append(b);
  }
  els.showAll.addEventListener('click', () => {
    allTypes.forEach((t) => activeTypes.add(t));
    update(Number(els.slider.value));
  });

  function eraFor(year) {
    return eras.find((e) => year >= e.start && year <= e.end) ?? eras[eras.length - 1];
  }

  function update(year) {
    els.year.textContent = formatYear(year);
    const era = eraFor(year);
    els.eraName.textContent = era.name;
    els.eraBlurb.textContent = era.blurb;
    els.eras.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.name === era.name));
    if (map.getLayer('sites')) map.setFilter('sites', mapFilter(year));
    if (map.getLayer('walls')) {
      map.setFilter('walls', ['all', ['<=', ['get', 'start_year'], year], ['!=', ['get', 'certainty'], 'reconstructed']]);
      map.setFilter('walls-reconstructed', ['all', ['<=', ['get', 'start_year'], year], ['==', ['get', 'certainty'], 'reconstructed']]);
    }
    applyHistoricalMap(year);
    const byType = Object.fromEntries(allTypes.map((t) => [t, 0]));
    for (const f of sites.features) {
      const p = f.properties;
      if (standing(p, year)) byType[p.type] = (byType[p.type] ?? 0) + 1;
    }
    let shown = 0;
    let total = 0;
    for (const t of allTypes) {
      const { button, n } = legendCounts[t];
      const on = activeTypes.has(t);
      button.classList.toggle('off', !on);
      button.setAttribute('aria-pressed', String(on));
      n.textContent = byType[t];
      total += byType[t];
      if (on) shown += byType[t];
    }
    els.showAll.hidden = activeTypes.size === allTypes.length;
    els.count.textContent = shown === total
      ? `${total} of ${sites.features.length} sites standing`
      : `${shown} shown (${total} of ${sites.features.length} sites standing)`;
  }

  for (const era of eras) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = era.name;
    b.dataset.name = era.name;
    b.addEventListener('click', () => {
      els.slider.value = Math.round((era.start + era.end) / 2);
      update(Number(els.slider.value));
    });
    els.eras.append(b);
  }

  els.slider.addEventListener('input', () => update(Number(els.slider.value)));

  let timer = null;
  els.play.addEventListener('click', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      els.play.textContent = 'Play';
      return;
    }
    if (Number(els.slider.value) >= maxYear) els.slider.value = minYear;
    els.play.textContent = 'Pause';
    timer = setInterval(() => {
      const next = Math.min(maxYear, Number(els.slider.value) + 8);
      els.slider.value = next;
      update(next);
      if (next >= maxYear) els.play.click();
    }, 40);
  });

  let mapsReady = false;

  function activeHistoricalMap(year) {
    const mode = els.mapMode.value;
    if (mode === 'none') return null;
    if (mode !== 'auto') return HISTORICAL_MAPS.find((m) => m.id === mode) ?? null;
    return HISTORICAL_MAPS.find((m) => year >= m.from && year <= m.to) ?? null;
  }

  function applyHistoricalMap(year) {
    const pct = Number(els.mapOpacity.value);
    els.mapOpacityValue.textContent = `${pct}%`;
    const active = activeHistoricalMap(year);
    const auto = els.mapMode.value === 'auto';
    els.mapCaption.textContent = active
      ? active.caption
      : auto
        ? 'No georeferenced map is available for this period.'
        : '';
    if (!mapsReady) return;
    for (const m of HISTORICAL_MAPS) {
      const id = `map-${m.id}`;
      const on = m === active;
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      map.setPaintProperty(id, 'raster-opacity', pct / 100);
    }
  }

  const modeOptions = [['auto', 'Auto (follows the slider)'], ['none', 'None'], ...HISTORICAL_MAPS.map((m) => [m.id, m.label])];
  for (const [value, label] of modeOptions) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    els.mapMode.append(o);
  }
  els.mapMode.addEventListener('change', () => applyHistoricalMap(Number(els.slider.value)));
  els.mapOpacity.addEventListener('input', () => applyHistoricalMap(Number(els.slider.value)));

  map.on('load', () => {
    for (const m of HISTORICAL_MAPS) {
      map.addSource(`map-${m.id}`, {
        type: 'raster',
        tiles: [m.tiles.startsWith('/') ? `${location.origin}${m.tiles}` : m.tiles],
        tileSize: 512,
        minzoom: m.minzoom,
        maxzoom: m.maxzoom,
        bounds: m.bounds,
        attribution: m.attribution,
      });
      map.addLayer({
        id: `map-${m.id}`,
        type: 'raster',
        source: `map-${m.id}`,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': Number(els.mapOpacity.value) / 100, 'raster-fade-duration': 0 },
      });
    }
    mapsReady = true;
    applyHistoricalMap(Number(els.slider.value));

    map.addSource('walls', {
      type: 'geojson',
      data: walls,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    });
    const wallColor = ['match', ['get', 'wall'], ...Object.entries(WALL_COLORS).flat(), '#444444'];
    const wallWidth = ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 4];
    const startYear = Number(els.slider.value);
    // Surviving/mapped remains are solid; the circuit traced from Clarke's 1830 plan is dashed.
    map.addLayer({
      id: 'walls',
      type: 'line',
      source: 'walls',
      filter: ['all', ['<=', ['get', 'start_year'], startYear], ['!=', ['get', 'certainty'], 'reconstructed']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': wallColor, 'line-width': wallWidth, 'line-opacity': 0.9 },
    });
    map.addLayer({
      id: 'walls-reconstructed',
      type: 'line',
      source: 'walls',
      filter: ['all', ['<=', ['get', 'start_year'], startYear], ['==', ['get', 'certainty'], 'reconstructed']],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': wallColor, 'line-width': wallWidth, 'line-opacity': 0.75, 'line-dasharray': [2, 1.5] },
    });
    els.wallsToggle.addEventListener('change', () => {
      const v = els.wallsToggle.checked ? 'visible' : 'none';
      map.setLayoutProperty('walls', 'visibility', v);
      map.setLayoutProperty('walls-reconstructed', 'visibility', v);
    });

    map.addSource('sites', { type: 'geojson', data: sites });
    map.addLayer({
      id: 'sites',
      type: 'circle',
      source: 'sites',
      filter: mapFilter(Number(els.slider.value)),
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 9],
        'circle-color': colorExpr,
        'circle-opacity': ['case', ['==', ['get', 'date_precision'], 'period'], 0.35, 0.9],
        'circle-stroke-color': ['case', ['==', ['get', 'date_precision'], 'period'], colorExpr, '#fff'],
        'circle-stroke-width': 1.5,
      },
    });

    map.on('click', 'sites', (e) => {
      const f = e.features[0];
      const p = f.properties;
      const dates = p.end_year != null ? `${formatYear(p.start_year)} – ${formatYear(p.end_year)}` : `from ${formatYear(p.start_year)}`;
      const node = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = p.name;
      const d = document.createElement('p');
      d.textContent = `${p.type} · ${dates}`;
      node.append(h, d);
      if (p.date_precision && p.date_precision !== 'year') {
        const n = document.createElement('p');
        n.textContent = p.date_precision === 'period'
          ? 'Date is the start of its historical period, not a construction date.'
          : `Date known to the ${p.date_precision}.`;
        node.append(n);
      }
      if (p.description) {
        const ds = document.createElement('p');
        ds.textContent = p.description;
        node.append(ds);
      }
      if (p.wikipedia_url) {
        const a = document.createElement('a');
        a.href = p.wikipedia_url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Wikipedia';
        node.append(a);
      }
      new maplibregl.Popup({ offset: 10 }).setLngLat(f.geometry.coordinates).setDOMContent(node).addTo(map);
    });
    map.on('mouseenter', 'sites', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'sites', () => (map.getCanvas().style.cursor = ''));
    update(Number(els.slider.value));
  });

  update(Number(els.slider.value));
}

main();
