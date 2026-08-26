import { useEffect } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore, type ToolId } from '@/state/store';
import { Icon } from '@/components/Icon';

/**
 * The floating Map/List pill.
 *
 * The map view is never unmounted when the list is showing — the list is laid
 * over it. Tearing down and rebuilding a MapView on every toggle costs a full
 * basemap fetch and loses the user's extent, which is exactly the thing they
 * were looking at before they tapped List.
 */
export function MobileViewToggle(): React.ReactElement | null {
  const config = useConfig();
  const view = useAppStore((s) => s.mobileView);
  const setView = useAppStore((s) => s.setMobileView);
  const resultCount = useAppStore((s) => s.resultCount);
  const loading = useAppStore((s) => s.resultsLoading);

  if (!config.huntFinder.enabled) return null;

  const showingMap = view === 'map';

  return (
    <button
      type="button"
      className="hp-viewtoggle"
      onClick={() => setView(showingMap ? 'list' : 'map')}
    >
      <Icon name={showingMap ? 'list' : 'map'} size={17} />
      {showingMap
        ? loading
          ? 'List'
          : `List (${resultCount.toLocaleString()})`
        : 'Map'}
    </button>
  );
}

interface ToolEntry {
  id: Exclude<ToolId, null>;
  label: string;
  icon: string;
}

/**
 * Tools on mobile.
 *
 * The desktop tool rail is a permanent vertical strip; on a phone that same
 * rail became a horizontally scrolling band that ate a third of the screen and
 * pushed the map below the fold. Here it is a button on the map that opens a
 * grid, and the chosen panel takes over the screen until dismissed.
 */
export function ToolsSheet({ entries }: { entries: ToolEntry[] }): React.ReactElement | null {
  const open = useAppStore((s) => s.toolsSheetOpen);
  const setOpen = useAppStore((s) => s.setToolsSheetOpen);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setMobileView = useAppStore((s) => s.setMobileView);
  const failedCount = useAppStore((s) => s.health.filter((h) => h.status === 'failed').length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <>
      <div className="hp-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="hp-sheet hp-sheet--tools" role="dialog" aria-modal="true" aria-label="Map tools">
        <header className="hp-sheet__header">
          <h2 className="hp-sheet__title">Tools</h2>
          <button
            type="button"
            className="hp-iconbtn"
            onClick={() => setOpen(false)}
            aria-label="Close tools"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="hp-toolgrid">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="hp-toolgrid__btn"
              onClick={() => {
                setOpen(false);
                // The results rail is a view on mobile, not a tool panel.
                if (entry.id === 'huntFinder') {
                  setMobileView('list');
                  return;
                }
                setActiveTool(entry.id);
                setSidebarOpen(true);
              }}
            >
              <Icon name={entry.icon} size={22} />
              <span>{entry.label}</span>
              {entry.id === 'health' && failedCount > 0 ? (
                <span className="hp-badge hp-badge--error">{failedCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function ToolsButton(): React.ReactElement {
  const setOpen = useAppStore((s) => s.setToolsSheetOpen);
  const failedCount = useAppStore((s) => s.health.filter((h) => h.status === 'failed').length);
  return (
    <button
      type="button"
      className="hp-toolsfab"
      onClick={() => setOpen(true)}
      aria-label="Map tools"
    >
      <Icon name="layers" size={20} />
      {failedCount > 0 ? <span className="hp-badge hp-badge--error">{failedCount}</span> : null}
    </button>
  );
}
