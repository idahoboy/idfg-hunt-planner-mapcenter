import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadConfig, ConfigError } from '@/config/loadConfig';
import { ConfigContext } from '@/config/ConfigContext';
import { configureEsri } from '@/map/esriSetup';
import { readUrlState } from '@/state/urlState';
import { useAppStore } from '@/state/store';
import { App } from '@/app/App';
import '@/styles/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root is missing from index.html');
const root = createRoot(rootEl);

function renderFatal(title: string, detail: string): void {
  root.render(
    <div className="hp-fatal" role="alert">
      <h1>{title}</h1>
      <p>{detail}</p>
      <p className="hp-fatal__hint">
        An administrator can check <code>config/app.config.yml</code> and run{' '}
        <code>npm run config:validate</code>.
      </p>
    </div>,
  );
}

function applyTheme(theme: Record<string, string>): void {
  const style = document.documentElement.style;
  for (const [key, value] of Object.entries(theme)) {
    style.setProperty(`--hp-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
  }
}

void (async () => {
  try {
    const { config, rejectedLayers, disabledLayers } = await loadConfig();
    configureEsri(config);
    applyTheme(config.ui.theme);
    document.title = `${config.app.title} — ${config.app.subtitle ?? 'Map'}`;

    // Seed filter state from the URL before the first render so a shared link
    // opens with its filters already applied rather than flashing the full set.
    const urlState = readUrlState(config);
    if (Object.keys(urlState.filters).length > 0 || urlState.keyword) {
      useAppStore.setState({ filters: urlState.filters, keyword: urlState.keyword });
    }

    if (disabledLayers.length > 0) {
      console.info(
        `[config] ${disabledLayers.length} layer(s) are disabled in app.config.yml:`,
        disabledLayers.map((l) => l.title).join(', '),
      );
    }

    if (rejectedLayers.length > 0) {
      console.warn(
        `[config] ${rejectedLayers.length} layer(s) were skipped:`,
        rejectedLayers,
      );
    }

    root.render(
      <StrictMode>
        <ConfigContext.Provider value={config}>
          <App />
        </ConfigContext.Provider>
      </StrictMode>,
    );
  } catch (err) {
    console.error(err);
    if (err instanceof ConfigError) {
      renderFatal(
        'The map could not start',
        `${err.message}${err.detail ? ` — ${JSON.stringify(err.detail)}` : ''}`,
      );
    } else {
      renderFatal('The map could not start', err instanceof Error ? err.message : String(err));
    }
  }
})();
