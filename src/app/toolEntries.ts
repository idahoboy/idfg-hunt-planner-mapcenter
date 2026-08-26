import type { AppConfig } from '@/config/schema';
import type { ToolId } from '@/state/store';

export interface ToolEntry {
  id: Exclude<ToolId, null>;
  label: string;
  icon: string;
}

const BASE: ToolEntry[] = [
  { id: 'huntFinder', label: 'Results', icon: 'search' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
  { id: 'basemap', label: 'Basemap', icon: 'globe' },
  { id: 'highlight', label: 'Highlight', icon: 'bolt' },
  { id: 'search', label: 'Find place', icon: 'crosshair' },
  { id: 'upload', label: 'Upload', icon: 'upload' },
  { id: 'measure', label: 'Measure', icon: 'ruler' },
  { id: 'draw', label: 'Draw', icon: 'pencil' },
  { id: 'print', label: 'Print', icon: 'printer' },
  { id: 'share', label: 'Share', icon: 'link' },
];

/** Shared by the desktop tool rail and the mobile tools sheet. */
export function toolEntries(config: AppConfig): ToolEntry[] {
  const all: ToolEntry[] = [
    ...BASE,
    ...(config.diagnostics.healthPanel
      ? [{ id: 'health' as const, label: 'Service health', icon: 'alert' }]
      : []),
  ];
  return all.filter((entry) => {
    const tool = config.tools[entry.id] as { enabled?: boolean } | undefined;
    return entry.id === 'health' || tool?.enabled !== false;
  });
}
