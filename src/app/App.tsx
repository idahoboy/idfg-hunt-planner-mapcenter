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
import { useResultInteraction } from '@/features/results/useResultInteraction';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useUrlSync } from './useUrlSync';

/** Hooks that need the map context live here, inside <MapProvider>. */
function MapWiring(): null {
  useHuntSearch();
  useResultInteraction();
  useKeyboardShortcuts();
  useUrlSync();
  return null;
}

export function App(): React.ReactElement {
  const config = useConfig();
  const resultsOpen = useAppStore((s) => s.resultsOpen);
  const showFinder = config.huntFinder.enabled && resultsOpen;

  return (
    <MapProvider>
      <div className="hp-app">
        <Header />
        {config.huntFinder.enabled ? <FilterBar /> : null}

        <div className="hp-body">
          <Sidebar />
          {showFinder ? <ResultsRail /> : null}

          <main className="hp-mapwrap">
            <MapCanvas />
            <MapControls />
            <CoordinateReadout />
          </main>
        </div>

        <MapWiring />
        <Toast />
      </div>
    </MapProvider>
  );
}
