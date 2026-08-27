import { Suspense, lazy } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { toolEntries } from './toolEntries';
import { Icon } from '@/components/Icon';

/**
 * Tool panels load when their tool is opened.
 *
 * Importing all ten statically pulled Esri's Print, Sketch, Measurement and
 * Legend widgets into the initial bundle, for tools most sessions never touch.
 */
const PANELS: Record<string, React.ComponentType> = {
  layers: lazy(() => import('@/features/layers/LayersPanel').then((m) => ({ default: m.LayersPanel }))),
  basemap: lazy(() => import('@/features/layers/BasemapPanel').then((m) => ({ default: m.BasemapPanel }))),
  highlight: lazy(() => import('@/features/highlight/HighlightPanel').then((m) => ({ default: m.HighlightPanel }))),
  upload: lazy(() => import('@/features/upload/UploadPanel').then((m) => ({ default: m.UploadPanel }))),
  search: lazy(() => import('@/features/search/SearchPanel').then((m) => ({ default: m.SearchPanel }))),
  measure: lazy(() => import('@/features/measure/MeasurePanel').then((m) => ({ default: m.MeasurePanel }))),
  draw: lazy(() => import('@/features/draw/DrawPanel').then((m) => ({ default: m.DrawPanel }))),
  print: lazy(() => import('@/features/print/PrintPanel').then((m) => ({ default: m.PrintPanel }))),
  share: lazy(() => import('@/features/share/SharePanel').then((m) => ({ default: m.SharePanel }))),
  health: lazy(() => import('@/features/help/HealthPanel').then((m) => ({ default: m.HealthPanel }))),
};

export function Sidebar(): React.ReactElement {
  const config = useConfig();
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const failedCount = useAppStore((s) => s.health.filter((h) => h.status === 'failed').length);
  const resultsOpen = useAppStore((s) => s.resultsOpen);
  const setResultsOpen = useAppStore((s) => s.setResultsOpen);

  const entries = toolEntries(config).map((entry) => ({
    ...entry,
    render: PANELS[entry.id],
  }));

  const active = entries.find((e) => e.id === activeTool && e.id !== 'huntFinder');
  const Panel = active?.render;

  return (
    <div className={`hp-sidebar${sidebarOpen ? '' : ' is-collapsed'}`}>
      <nav className="hp-toolrail" aria-label="Map tools">
        <ul>
          {entries.map((entry) => {
            // The results rail is a separate surface, so its rail button is a
            // visibility toggle rather than a tool-panel selector.
            const isFinder = entry.id === 'huntFinder';
            const isActive = isFinder ? resultsOpen : entry.id === activeTool && sidebarOpen;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`hp-toolrail__btn${isActive ? ' is-active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => {
                    if (isFinder) { setResultsOpen(!resultsOpen); return; }
                    if (isActive && sidebarOpen) setSidebarOpen(false);
                    else { setActiveTool(entry.id); setSidebarOpen(true); }
                  }}
                >
                  <Icon name={entry.icon} size={20} />
                  <span className="hp-toolrail__label">{entry.label}</span>
                  {entry.id === 'health' && failedCount > 0 ? (
                    <span className="hp-badge hp-badge--error">{failedCount}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {sidebarOpen && Panel ? (
        <section className="hp-toolpanel" aria-label={active?.label}>
          <header className="hp-toolpanel__header">
            <h2>{active?.label}</h2>
            <button
              type="button"
              className="hp-iconbtn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close panel"
            >
              <Icon name="close" size={16} />
            </button>
          </header>
          <div className="hp-toolpanel__body">
            <Suspense fallback={<p className="hp-toolpanel__loading">Loading…</p>}>
              <Panel />
            </Suspense>
          </div>
        </section>
      ) : null}
    </div>
  );
}
