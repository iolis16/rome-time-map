import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const ROME = [12.4839, 41.8967];
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
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

  function yearFilter(year) {
    return [
      'all',
      ['<=', ['get', 'start_year'], year],
      ['any', ['!', ['has', 'end_year']], ['>=', ['get', 'end_year'], year]],
    ];
  }

  function eraFor(year) {
    return eras.find((e) => year >= e.start && year <= e.end) ?? eras[eras.length - 1];
  }

  function update(year) {
    els.year.textContent = formatYear(year);
    const era = eraFor(year);
    els.eraName.textContent = era.name;
    els.eraBlurb.textContent = era.blurb;
    els.eras.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.name === era.name));
    if (map.getLayer('sites')) map.setFilter('sites', yearFilter(year));
    const visible = sites.features.filter((f) => {
      const p = f.properties;
      return p.start_year <= year && (p.end_year == null || p.end_year >= year);
    }).length;
    els.count.textContent = `${visible} of ${sites.features.length} sites standing`;
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

  map.on('load', () => {
    map.addSource('sites', { type: 'geojson', data: sites });
    map.addLayer({
      id: 'sites',
      type: 'circle',
      source: 'sites',
      filter: yearFilter(Number(els.slider.value)),
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
