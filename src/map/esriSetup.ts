import esriConfig from '@arcgis/core/config';
import type { AppConfig } from '@/config/schema';

/**
 * Assets are copied into the bundle by vite-plugin-static-copy, so the app runs
 * on networks that block js.arcgis.com. Override with VITE_ESRI_ASSETS_PATH if
 * you would rather serve them from a CDN.
 */
export function configureEsri(config: AppConfig): void {
  esriConfig.assetsPath =
    import.meta.env['VITE_ESRI_ASSETS_PATH'] ?? `${import.meta.env.BASE_URL}esri`;

  // NOTE: `trustedServers` makes the SDK send credentials with every request,
  // which browsers reject against services that answer
  // `Access-Control-Allow-Origin: *` — i.e. every public ArcGIS service this
  // app uses. It belongs only on servers that actually require authentication,
  // so the config list is applied verbatim and is empty by default.
  for (const server of config.network.trustedServers) {
    if (!esriConfig.request.trustedServers?.includes(server)) {
      esriConfig.request.trustedServers?.push(server);
    }
  }

  if (config.network.proxyUrl) {
    esriConfig.request.proxyUrl = config.network.proxyUrl;
  }
  esriConfig.request.timeout = config.network.requestTimeoutMs;

  // 4.x logs a deprecation banner per layer by default; the health panel is a
  // better channel for that information.
  // The SDK has no 'debug' level; map it onto 'info'.
  esriConfig.log.level =
    config.diagnostics.logLevel === 'debug' ? 'info' : config.diagnostics.logLevel;
}
