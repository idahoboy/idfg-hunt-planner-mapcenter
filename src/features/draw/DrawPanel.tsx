import { useEffect, useRef, useState } from 'react';
import Sketch from '@arcgis/core/widgets/Sketch';
import Graphic from '@arcgis/core/Graphic';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
import { useConfig } from '@/config/ConfigContext';
import { useMap } from '@/map/MapProvider';
import { useAppStore } from '@/state/store';
import { Icon } from '@/components/Icon';
import { useWidgetContainer } from '@/map/useWidgetContainer';

interface DrawToolConfig {
  defaultColor?: string;
  palette?: string[];
  textDefaults?: { size: number; color: string; haloColor: string; weight: string };
  persistToLocalStorage?: boolean;
}

const STORAGE_KEY = 'idfg.mapcenter.drawings.v1';

export function DrawPanel(): React.ReactElement {
  const config = useConfig();
  const { view, drawLayer, drawTextLayer, ready } = useMap();
  const showToast = useAppStore((s) => s.showToast);

  const [hostRef, makeContainer] = useWidgetContainer();
  const sketchRef = useRef<Sketch | null>(null);
  const tool = (config.tools['draw'] ?? {}) as DrawToolConfig;

  const [color, setColor] = useState(tool.defaultColor ?? '#ff7200');
  const [text, setText] = useState('');
  const [placingText, setPlacingText] = useState(false);

  useEffect(() => {
    if (!ready || !view || !hostRef.current) return;
    const container = makeContainer();
    if (!container) return;

    const sketch = new Sketch({
      view,
      container,
      layer: drawLayer,
      creationMode: 'update',
      availableCreateTools: ['point', 'polyline', 'polygon', 'rectangle', 'circle'],
      visibleElements: { settingsMenu: false, undoRedoMenu: true },
    });
    sketchRef.current = sketch;

    return () => { sketch.destroy(); sketchRef.current = null; };
  }, [ready, view, drawLayer, makeContainer, hostRef]);

  // Restore drawings across reloads — the legacy app lost everything on refresh.
  useEffect(() => {
    if (!ready || !tool.persistToLocalStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as { graphics?: unknown[] };
      for (const json of stored.graphics ?? []) {
        drawLayer.add(Graphic.fromJSON(json));
      }
    } catch {
      /* corrupt storage is not worth surfacing */
    }
  }, [ready, drawLayer, tool.persistToLocalStorage]);

  useEffect(() => {
    if (!ready || !tool.persistToLocalStorage) return;
    const handle = drawLayer.graphics.on('change', () => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ graphics: drawLayer.graphics.toArray().map((g) => g.toJSON()) }),
        );
      } catch {
        /* quota exceeded — drawings simply will not persist */
      }
    });
    return () => handle.remove();
  }, [ready, drawLayer, tool.persistToLocalStorage]);

  // Text is placed on its own layer: mixing TextSymbols into the sketch layer
  // makes them export as bare points in the print service.
  useEffect(() => {
    if (!placingText || !view || !text.trim()) return;

    const handle = view.on('click', (event) => {
      event.stopPropagation();
      drawTextLayer.add(
        new Graphic({
          geometry: event.mapPoint,
          symbol: new TextSymbol({
            text,
            color: tool.textDefaults?.color ?? '#000000',
            haloColor: tool.textDefaults?.haloColor ?? '#ffffff',
            haloSize: 1.5,
            font: {
              size: tool.textDefaults?.size ?? 14,
              family: 'Lato, Arial, sans-serif',
              weight: (tool.textDefaults?.weight ?? 'bold') as 'bold' | 'normal',
            },
          }),
        }),
      );
      setPlacingText(false);
      showToast('Text added to the map.', 'success');
    });

    return () => handle.remove();
  }, [placingText, view, text, drawTextLayer, tool.textDefaults, showToast]);

  function updateColor(next: string): void {
    setColor(next);
    const sketch = sketchRef.current;
    if (!sketch) return;
    sketch.viewModel.polygonSymbol = {
      type: 'simple-fill',
      color: `${next}40`,
      outline: { color: next, width: 2 },
    } as unknown as __esri.SimpleFillSymbol;
    sketch.viewModel.polylineSymbol = {
      type: 'simple-line', color: next, width: 2,
    } as unknown as __esri.SimpleLineSymbol;
    sketch.viewModel.pointSymbol = {
      type: 'simple-marker', color: next, size: 10,
      outline: { color: '#ffffff', width: 1 },
    } as unknown as __esri.SimpleMarkerSymbol;
  }

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Sketch shapes and add labels. Drawings can be selected, moved, reshaped, and
        undone — and they survive a page refresh.
      </p>

      <fieldset className="hp-field">
        <legend className="hp-field__label">Colour</legend>
        <div className="hp-swatches">
          {(tool.palette ?? ['#ff7200']).map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`hp-swatch-btn${color === swatch ? ' is-active' : ''}`}
              style={{ background: swatch }}
              aria-label={`Use ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => updateColor(swatch)}
            />
          ))}
        </div>
      </fieldset>

      <div ref={hostRef} className="hp-esri-widget" />

      <section className="hp-panel__section">
        <h3 className="hp-panel__heading">Add text</h3>
        <div className="hp-field">
          <label className="hp-field__label" htmlFor="draw-text">Label</label>
          <input
            id="draw-text"
            className="hp-input"
            value={text}
            placeholder="Camp, glassing spot, gate…"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="hp-panel__actions">
          <button
            type="button"
            className={`hp-btn ${placingText ? 'hp-btn--accent' : 'hp-btn--primary'}`}
            disabled={!text.trim()}
            onClick={() => setPlacingText((v) => !v)}
          >
            <Icon name="pencil" size={15} />
            {placingText ? 'Click the map…' : 'Place text'}
          </button>
          <button type="button" className="hp-btn hp-btn--ghost" onClick={() => drawTextLayer.removeAll()}>
            Clear text
          </button>
        </div>
      </section>

      <button
        type="button"
        className="hp-btn hp-btn--ghost"
        onClick={() => {
          drawLayer.removeAll();
          drawTextLayer.removeAll();
          try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        }}
      >
        Clear all drawings
      </button>
    </div>
  );
}
