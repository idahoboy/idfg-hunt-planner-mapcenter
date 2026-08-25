import { useEffect } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore, type ToolId } from '@/state/store';
import { useMap } from '@/map/MapProvider';

const SHORTCUT_TO_TOOL: Record<string, ToolId> = {
  toggleLayers: 'layers',
  search: 'search',
  print: 'print',
  toggleFilters: 'huntFinder',
};

export function useKeyboardShortcuts(): void {
  const config = useConfig();
  const { highlightLayer } = useMap();
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setSelectedResultKey = useAppStore((s) => s.setSelectedResultKey);

  useEffect(() => {
    if (config.ui.a11y['keyboardShortcuts'] === false) return;
    const shortcuts = config.ui.shortcuts;

    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      for (const [action, key] of Object.entries(shortcuts)) {
        if (event.key !== key) continue;

        if (action === 'clearHighlight') {
          highlightLayer.removeAll();
          setSelectedResultKey(null);
          return;
        }
        if (action === 'help') {
          if (config.app.helpUrl) window.open(config.app.helpUrl, '_blank', 'noopener');
          event.preventDefault();
          return;
        }
        const tool = SHORTCUT_TO_TOOL[action];
        if (tool) {
          setActiveTool(tool);
          setSidebarOpen(true);
          event.preventDefault();
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config, highlightLayer, setActiveTool, setSidebarOpen, setSelectedResultKey]);
}
