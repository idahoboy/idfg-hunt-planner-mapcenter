import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { toolEntries } from './toolEntries';
import { Icon } from '@/components/Icon';
import { LayersPanel } from '@/features/layers/LayersPanel';
import { BasemapPanel } from '@/features/layers/BasemapPanel';
import { HighlightPanel } from '@/features/highlight/HighlightPanel';
import { UploadPanel } from '@/features/upload/UploadPanel';
import { SearchPanel } from '@/features/search/SearchPanel';
import { MeasurePanel } from '@/features/measure/MeasurePanel';
import { DrawPanel } from '@/features/draw/DrawPanel';
import { PrintPanel } from '@/features/print/PrintPanel';
import { SharePanel } from '@/features/share/SharePanel';
import { HealthPanel } from '@/features/help/HealthPanel';

const PANELS: Record<string, () => React.ReactElement> = {
  layers: LayersPanel,
  basemap: BasemapPanel,
  highlight: HighlightPanel,
  upload: UploadPanel,
  search: SearchPanel,
  measure: MeasurePanel,
  draw: DrawPanel,
  print: PrintPanel,
  share: SharePanel,
  health: HealthPanel,
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
    render: PANELS[entry.id] ?? ((): React.ReactElement => <></>),
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
            <Panel />
          </div>
        </section>
      ) : null}
    </div>
  );
}
