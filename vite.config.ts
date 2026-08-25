import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cp } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import sirv from 'sirv';

/**
 * The ArcGIS Maps SDK ships ~77MB of assets across ~10,800 files (icons, i18n
 * strings, projection WASM). We stream-copy them after the bundle is written
 * rather than routing them through Rollup's asset pipeline, which would hold
 * every file in memory and exhaust the V8 heap.
 *
 * Copying them locally (instead of pointing assetsPath at js.arcgis.com) keeps
 * the container self-contained and working on networks that block the CDN.
 */
function copyEsriAssets(): Plugin {
  return {
    name: 'copy-esri-assets',
    apply: 'build',
    async closeBundle() {
      const from = resolve(process.cwd(), 'node_modules/@arcgis/core/assets');
      const to = resolve(process.cwd(), 'dist/esri');
      await cp(from, to, { recursive: true, force: true });
      this.info?.(`copied ArcGIS SDK assets -> ${to}`);
    },
  };
}

/**
 * In production the SDK assets are copied into dist/esri. The dev server has no
 * such copy step, so serve them straight out of node_modules under the same
 * /esri prefix — otherwise every Calcite icon and i18n string 404s in dev only.
 */
function serveEsriAssetsInDev(): Plugin {
  return {
    name: 'serve-esri-assets-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/esri', sirv(resolve(process.cwd(), 'node_modules/@arcgis/core/assets'), {
        dev: true,
        etag: true,
      }));
    },
  };
}

/**
 * `base` matters because GitHub Pages serves from a sub-path
 * (/<repo>/) while the container serves from the site root. Everything the app
 * fetches at runtime — the YAML config, the SDK assets, basemap thumbnails —
 * is resolved against import.meta.env.BASE_URL rather than a leading slash.
 */
const base = process.env['VITE_BASE'] ?? '/';

// When the SDK assets are served from a CDN there is nothing to copy, which
// takes the Pages deployment from ~100MB to ~17MB.
const bundleEsriAssets = !process.env['VITE_ESRI_ASSETS_PATH'];

/**
 * Ships the default config alongside the bundle. Always runs: in Docker this
 * file is bind-mounted over so editing the host copy changes the running app,
 * and on a static host it is the only copy there is.
 */
function copyRuntimeConfig(): Plugin {
  return {
    name: 'copy-runtime-config',
    apply: 'build',
    async closeBundle() {
      await cp(
        resolve(process.cwd(), 'config/app.config.yml'),
        resolve(process.cwd(), 'dist/config/app.config.yml'),
        { force: true },
      );
      this.info?.('copied app.config.yml -> dist/config/');
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    serveEsriAssetsInDev(),
    ...(bundleEsriAssets ? [copyEsriAssets()] : []),
    copyRuntimeConfig(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // The ArcGIS SDK does not minify usefully with esbuild's default settings
    // and sourcemaps on a 4MB bundle are what pushed the build over the heap
    // limit; keep them off for production and rely on the dev server instead.
    sourcemap: false,
    chunkSizeWarningLimit: 6144,
    // Vite's default vendor splitting handles the SDK correctly. Hand-written
    // manualChunks produced circular vendor <-> react <-> arcgis chunks.
    rollupOptions: {},
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: true },
  },
  preview: { host: '0.0.0.0', port: 4173 },
});
