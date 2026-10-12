import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const ROME = [12.4839, 41.8967];
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
// Nolli's 1748 "Pianta Grande di Roma", georeferenced by Univ. of Oregon / Stanford CSTA (CC BY-NC-SA 4.0).
const NOLLI_TILES = 'https://stacks.stanford.edu/file/nn217br6628/{z}/{x}/{y}.png';
const NOLLI_BOUNDS = [12.441, 41.862, 12.527, 41.921];
const NOLLI_ATTRIBUTION =
  '<a href="https://purl.stanford.edu/nn217br6628" target="_blank" rel="noopener">Nolli map: Univ. of Oregon / Stanford CSTA, CC BY-NC-SA 4.0</a>';
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
  nolli: document.getElementById('nolli-opacity'),
  nolliValue: document.getElementById('nolli-value'),
};

const formatYear = (y) => (y < 0 ? `${-y} BC` : y === 0 ? '1 BC' : `${y} AD`);

async function main() {
  const [eras, sites] = await Promise.all([
    fetch('/eras.json').then((r) => r.json()),
    fetch('/sites.geojson').then((r) => r.json()),
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

  const setNolli = () => {
    const pct = Number(els.nolli.value);
    els.nolliValue.textContent = `${pct}%`;
    if (map.getLayer('nolli')) map.setPaintProperty('nolli', 'raster-opacity', pct / 100);
  };
  els.nolli.addEventListener('input', setNolli);

  map.on('load', () => {
    map.addSource('nolli', {
      type: 'raster',
      tiles: [NOLLI_TILES],
      tileSize: 512,
      minzoom: 10,
      maxzoom: 18,
      bounds: NOLLI_BOUNDS,
      attribution: NOLLI_ATTRIBUTION,
    });
    map.addLayer({
      id: 'nolli',
      type: 'raster',
      source: 'nolli',
      paint: { 'raster-opacity': Number(els.nolli.value) / 100, 'raster-fade-duration': 0 },
    });
    setNolli();

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
