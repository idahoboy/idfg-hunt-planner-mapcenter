import { create } from 'zustand';
import type { LayerLoadProblem } from '@/map/layerFactory';

export type ToolId =
  | 'layers' | 'basemap' | 'highlight' | 'huntFinder' | 'upload'
  | 'search' | 'measure' | 'draw' | 'print' | 'share' | 'health' | null;

export interface ResultRecord {
  /** `${sourceId}:${id}` — unique across sources. */
  key: string;
  sourceId: string;
  sourceTitle: string;
  id: string;
  title: string;
  subtitle: string;
  attributes: Record<string, unknown>;
}

export interface ServiceHealth {
  layerId: string;
  title: string;
  url: string;
  status: 'ok' | 'fallback' | 'failed';
  message?: string;
}

interface AppState {
  // ---- tool panel ----
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // ---- mobile shell ----
  /**
   * On a phone the map and the results list compete for the whole screen, so
   * exactly one is shown at a time and a floating pill swaps between them.
   * Ignored above the mobile breakpoint, where both are visible at once.
   */
  mobileView: 'map' | 'list';
  setMobileView: (view: 'map' | 'list') => void;
  /** Full-screen filter sheet; replaces the desktop filter bar on mobile. */
  filterSheetOpen: boolean;
  setFilterSheetOpen: (open: boolean) => void;
  /** Bottom sheet holding the tool list; replaces the desktop tool rail. */
  toolsSheetOpen: boolean;
  setToolsSheetOpen: (open: boolean) => void;
  /** The results rail is independent of the tool panel: opening Layers should
   *  not throw away the search the user just built. */
  resultsOpen: boolean;
  setResultsOpen: (open: boolean) => void;

  // ---- layers ----
  layerVisibility: Record<string, boolean>;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  setLayerVisibilityBulk: (next: Record<string, boolean>) => void;
  layerOpacity: Record<string, number>;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  /** Layers currently below their scaleGate threshold. */
  gatedLayers: Record<string, boolean>;
  setGatedLayers: (next: Record<string, boolean>) => void;

  // ---- basemap ----
  basemapId: string;
  setBasemapId: (id: string) => void;

  // ---- hunt finder ----
  filters: Record<string, string[]>;
  setFilter: (facetId: string, values: string[]) => void;
  toggleFilterValue: (facetId: string, value: string) => void;
  clearFilter: (facetId: string) => void;
  clearAllFilters: () => void;
  keyword: string;
  setKeyword: (keyword: string) => void;
  syncToExtent: boolean;
  setSyncToExtent: (sync: boolean) => void;

  /**
   * How many records to fetch. "Load more" raises it; any filter change resets
   * it. Without this the list silently stopped at the first page and the rest
   * of the matches were simply unreachable.
   */
  resultLimit: number;
  loadMore: () => void;
  /**
   * Statewide there are thousands of areas, and a truncated dump of them is
   * not a useful thing to hand someone. With no filters applied the rail shows
   * a starting panel instead; this opts out of it.
   */
  browseAll: boolean;
  setBrowseAll: (browse: boolean) => void;

  results: ResultRecord[];
  resultCount: number;
  resultsLoading: boolean;
  resultsError: string | null;
  setResults: (results: ResultRecord[], count: number) => void;
  setResultsLoading: (loading: boolean) => void;
  setResultsError: (error: string | null) => void;

  hoveredResultKey: string | null;
  setHoveredResultKey: (key: string | null) => void;
  selectedResultKey: string | null;
  setSelectedResultKey: (key: string | null) => void;
  /**
   * Mobile only: the card expanded in place. The list covers the map on a
   * phone, so tapping a card opens its detail rather than silently zooming a
   * map the user cannot see; the detail carries the action that goes there.
   */
  expandedResultKey: string | null;
  setExpandedResultKey: (key: string | null) => void;

  // ---- map click ----
  /** Result of the last map click. `unknown` so the store stays free of
   *  feature-layer types; the panel narrows it. */
  clickResult: unknown | null;
  clickLoading: boolean;
  setClickResult: (result: unknown | null) => void;
  setClickLoading: (loading: boolean) => void;
  clearClickResult: () => void;

  // ---- highlight ----
  highlightLabels: string[];
  setHighlightLabels: (labels: string[]) => void;
  kmlLinks: Array<{ label: string; url: string }>;
  setKmlLinks: (links: Array<{ label: string; url: string }>) => void;

  // ---- diagnostics ----
  health: ServiceHealth[];
  addHealthProblem: (problem: LayerLoadProblem) => void;
  setHealthOk: (entries: ServiceHealth[]) => void;

  // ---- notifications ----
  toast: { message: string; tone: 'info' | 'error' | 'success' } | null;
  showToast: (message: string, tone?: 'info' | 'error' | 'success') => void;
  dismissToast: () => void;
}

/**
 * A single frozen empty array shared by every "no values yet" selector.
 * Returning a fresh `[]` from a zustand selector makes getSnapshot return a
 * new reference on every render, which React treats as a state change and
 * loops until it throws "Maximum update depth exceeded".
 */
export const EMPTY_VALUES: readonly string[] = Object.freeze([]);

export const useAppStore = create<AppState>((set) => ({
  activeTool: 'layers',
  setActiveTool: (activeTool) => set({ activeTool }),
  // On a phone a tool panel covers the whole screen, so opening one before the
  // user asks would bury the map on first paint. Desktop has room for both.
  sidebarOpen: typeof window === 'undefined' ? true : window.innerWidth > 768,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  mobileView: 'map',
  setMobileView: (mobileView) => set({ mobileView }),
  filterSheetOpen: false,
  setFilterSheetOpen: (filterSheetOpen) => set({ filterSheetOpen }),
  toolsSheetOpen: false,
  setToolsSheetOpen: (toolsSheetOpen) => set({ toolsSheetOpen }),
  resultsOpen: true,
  setResultsOpen: (resultsOpen) => set({ resultsOpen }),

  layerVisibility: {},
  setLayerVisible: (layerId, visible) =>
    set((s) => ({ layerVisibility: { ...s.layerVisibility, [layerId]: visible } })),
  setLayerVisibilityBulk: (next) =>
    set((s) => ({ layerVisibility: { ...s.layerVisibility, ...next } })),
  layerOpacity: {},
  setLayerOpacity: (layerId, opacity) =>
    set((s) => ({ layerOpacity: { ...s.layerOpacity, [layerId]: opacity } })),
  gatedLayers: {},
  setGatedLayers: (gatedLayers) => set({ gatedLayers }),

  basemapId: '',
  setBasemapId: (basemapId) => set({ basemapId }),

  filters: {},
  setFilter: (facetId, values) =>
    set((s) => ({ filters: { ...s.filters, [facetId]: values }, resultLimit: 50 })),
  toggleFilterValue: (facetId, value) =>
    set((s) => {
      const current = s.filters[facetId] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { filters: { ...s.filters, [facetId]: next }, resultLimit: 50 };
    }),
  clearFilter: (facetId) =>
    set((s) => {
      const next = { ...s.filters };
      delete next[facetId];
      return { filters: next, resultLimit: 50 };
    }),
  clearAllFilters: () => set({ filters: {}, keyword: '', resultLimit: 50, browseAll: false }),
  keyword: '',
  setKeyword: (keyword) => set({ keyword, resultLimit: 50 }),
  syncToExtent: false,
  setSyncToExtent: (syncToExtent) => set({ syncToExtent }),

  resultLimit: 50,
  loadMore: () => set((s) => ({ resultLimit: s.resultLimit + 50 })),
  browseAll: false,
  setBrowseAll: (browseAll) => set({ browseAll }),

  results: [],
  resultCount: 0,
  resultsLoading: false,
  resultsError: null,
  setResults: (results, resultCount) => set({ results, resultCount, resultsError: null }),
  setResultsLoading: (resultsLoading) => set({ resultsLoading }),
  setResultsError: (resultsError) => set({ resultsError, resultsLoading: false }),

  hoveredResultKey: null,
  setHoveredResultKey: (hoveredResultKey) => set({ hoveredResultKey }),
  selectedResultKey: null,
  setSelectedResultKey: (selectedResultKey) => set({ selectedResultKey }),
  expandedResultKey: null,
  setExpandedResultKey: (expandedResultKey) => set({ expandedResultKey }),

  clickResult: null,
  clickLoading: false,
  setClickResult: (clickResult) => set({ clickResult }),
  setClickLoading: (clickLoading) => set({ clickLoading }),
  clearClickResult: () => set({ clickResult: null, clickLoading: false }),

  highlightLabels: [],
  setHighlightLabels: (highlightLabels) => set({ highlightLabels }),
  kmlLinks: [],
  setKmlLinks: (kmlLinks) => set({ kmlLinks }),

  health: [],
  addHealthProblem: (problem) =>
    set((s) => ({
      health: [
        ...s.health.filter((h) => h.layerId !== problem.layerId),
        {
          layerId: problem.layerId,
          title: problem.title,
          url: problem.url,
          status: problem.usedFallback ? 'fallback' : 'failed',
          message: problem.message,
        },
      ],
    })),
  setHealthOk: (entries) =>
    set((s) => {
      const existing = new Map(s.health.map((h) => [h.layerId, h]));
      for (const entry of entries) if (!existing.has(entry.layerId)) existing.set(entry.layerId, entry);
      return { health: [...existing.values()] };
    }),

  toast: null,
  showToast: (message, tone = 'info') => set({ toast: { message, tone } }),
  dismissToast: () => set({ toast: null }),
}));
