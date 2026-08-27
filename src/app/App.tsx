import { useEffect, useRef } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { MapProvider, MapCanvas } from '@/map/MapProvider';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MapControls } from './MapControls';
import { FilterBar } from '@/features/filterbar/FilterBar';
import { ResultsRail } from '@/features/results/ResultsRail';
import { CoordinateReadout } from '@/features/coords/CoordinateReadout';
import { Toast } from '@/components/Toast';
import { useHuntSearch } from '@/features/results/useHuntSearch';
import { useMapClick } from '@/features/click/useMapClick';
import { LocationPanel } from '@/features/click/LocationPanel';
import { LocationSummary } from '@/features/click/LocationSummary';
import { useResultInteraction } from '@/features/results/useResultInteraction';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useUrlSync } from './useUrlSync';
import { FilterSheet } from '@/features/filterbar/FilterSheet';
import { MobileViewToggle, ToolsSheet, ToolsButton } from './MobileShell';
import { toolEntries } from './toolEntries';
import { useMediaQuery } from '@/lib/useMediaQuery';

/** Hooks that need the map context live here, inside <MapProvider>. */
function MapWiring(): null {
  useHuntSearch();
  useResultInteraction();
  useMapClick();
  useKeyboardShortcuts();
  useUrlSync();
  return null;
}

export function App(): React.ReactElement {
  const config = useConfig();
  const resultsOpen = useAppStore((s) => s.resultsOpen);
  const mobileView = useAppStore((s) => s.mobileView);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const activeTool = useAppStore((s) => s.activeTool);
  const isMobile = useMediaQuery(
    `(max-width: ${config.ui.layout['mobileBreakpoint'] ?? 768}px)`,
  );

  // Crossing into mobile, dismiss whatever was open on the desktop layout:
  // a tool panel and a sheet would otherwise stack on top of each other.
  const wasMobile = useRef(isMobile);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setFilterSheetOpen = useAppStore((s) => s.setFilterSheetOpen);
  const setToolsSheetOpen = useAppStore((s) => s.setToolsSheetOpen);
  useEffect(() => {
    if (isMobile && !wasMobile.current) setSidebarOpen(false);
    if (!isMobile && wasMobile.current) {
      setFilterSheetOpen(false);
      setToolsSheetOpen(false);
    }
    wasMobile.current = isMobile;
  }, [isMobile, setSidebarOpen, setFilterSheetOpen, setToolsSheetOpen]);

  // Mobile shows exactly one of map/list; desktop shows both side by side.
  const showFinder = config.huntFinder.enabled && (isMobile ? mobileView === 'list' : resultsOpen);
  // A tool panel is open over the map only when a tool other than the finder
  // is selected — on mobile that panel is a sheet, so it also hides the pill.
  const toolPanelOpen = isMobile && sidebarOpen && activeTool !== null && activeTool !== 'huntFinder';
  // An expanded card carries its own "Show on map", and the floating pill would
  // otherwise sit right on top of that button.
  const expandedResultKey = useAppStore((s) => s.expandedResultKey);
  const pillHidden = toolPanelOpen || (mobileView === 'list' && expandedResultKey !== null);

  return (
    <MapProvider>
      <div className={`hp-app${isMobile ? ' hp-app--mobile' : ''}`} data-mobile-view={mobileView}>
        <Header />
        {config.huntFinder.enabled ? <FilterBar /> : null}

        <div className="hp-body">
          {/*
           * Results and layers stack in one column rather than competing for
           * two. A double column leaves the map under half the width on a
           * 1280px laptop, and the map is the product; a single switching
           * panel hides one exactly when someone wants both. Stacking keeps
           * both visible and needs no separate mobile story — the sheets
           * already handle small screens.
           */}
          <div className="hp-leftstack">
            {showFinder ? <ResultsRail /> : null}
            <Sidebar />
          </div>

          <main className="hp-mapwrap">
            <MapCanvas />
            <MapControls />
            <CoordinateReadout />
            <LocationSummary />
            <LocationPanel />
          </main>
        </div>

        {isMobile ? (
          <>
            <FilterSheet />
            <ToolsSheet entries={toolEntries(config)} />
            {!toolPanelOpen && mobileView === 'map' ? <ToolsButton /> : null}
            {!pillHidden ? <MobileViewToggle /> : null}
          </>
        ) : null}

        <MapWiring />
        <Toast />
      </div>
    </MapProvider>
  );
}
