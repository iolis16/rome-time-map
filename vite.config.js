import { defineConfig } from 'vite';

export default defineConfig({
  // MapLibre 6 ships its own worker module; Vite's dep pre-bundling drops it in dev.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
