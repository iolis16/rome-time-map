import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// MapLibre 6 looks for maplibre-gl-worker.mjs next to the bundle it was loaded from
// (/assets/ in production) and Vite doesn't emit it, so the map would never render.
// Dev is fine: the file is served straight from node_modules.
function emitMaplibreWorker() {
  return {
    name: 'emit-maplibre-worker',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/maplibre-gl-worker.mjs',
        source: readFileSync(new URL('./node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url)),
      });
    },
  };
}

export default defineConfig({
  plugins: [emitMaplibreWorker()],
  // MapLibre 6 ships its own worker module; Vite's dep pre-bundling drops it in dev.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
