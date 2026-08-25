import { useRef, useState } from 'react';
import PopupTemplate from '@arcgis/core/PopupTemplate';
import { useConfig } from '@/config/ConfigContext';
import { useMap } from '@/map/MapProvider';
import { useAppStore } from '@/state/store';
import { parseTrackFile, type ParsedTrack } from '@/lib/trackParsers';
import { buildSymbol } from '@/map/symbols';
import { Icon } from '@/components/Icon';

interface UploadToolConfig {
  formats?: string[];
  maxFileSizeMb?: number;
  maxFeatures?: number;
  symbols?: {
    point?: { color: string; size: number; outline: string };
    line?: { color: string; width: number };
    polygon?: { color: string; outline: string };
  };
}

export function UploadPanel(): React.ReactElement {
  const config = useConfig();
  const { uploadLayer, view } = useMap();
  const showToast = useAppStore((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState<ParsedTrack[]>([]);
  const [busy, setBusy] = useState(false);

  const tool = (config.tools['upload'] ?? {}) as UploadToolConfig;
  const formats = tool.formats ?? ['gpx', 'kml', 'geojson', 'csv'];
  const maxBytes = (tool.maxFileSizeMb ?? 25) * 1024 * 1024;
  const maxFeatures = tool.maxFeatures ?? 20000;

  function symbolFor(geometryType: string) {
    const s = tool.symbols ?? {};
    if (geometryType === 'point' || geometryType === 'multipoint') {
      return buildSymbol({
        type: 'marker',
        color: s.point?.color ?? '#ff0000',
        size: s.point?.size ?? 9,
        outline: { color: s.point?.outline ?? '#000000', width: 1 },
      });
    }
    if (geometryType === 'polyline') {
      return buildSymbol({ type: 'line', color: s.line?.color ?? '#ff0000', width: s.line?.width ?? 3 });
    }
    return buildSymbol({
      type: 'fill',
      color: s.polygon?.color ?? 'rgba(255,0,0,0.25)',
      outline: { color: s.polygon?.outline ?? '#ff0000', width: 2 },
    });
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files?.length || !view) return;
    setBusy(true);

    try {
      for (const file of Array.from(files)) {
        if (file.size > maxBytes) {
          showToast(`${file.name} is larger than ${tool.maxFileSizeMb ?? 25} MB.`, 'error');
          continue;
        }

        const parsed = await parseTrackFile(file);
        if (parsed.graphics.length === 0) {
          showToast(`No mappable features found in ${file.name}.`, 'error');
          continue;
        }
        if (parsed.graphics.length > maxFeatures) {
          showToast(
            `${file.name} has ${parsed.graphics.length.toLocaleString()} features; showing the first ${maxFeatures.toLocaleString()}.`,
            'info',
          );
          parsed.graphics.length = maxFeatures;
        }

        for (const graphic of parsed.graphics) {
          const type = graphic.geometry?.type ?? 'point';
          graphic.symbol = symbolFor(type);
          graphic.popupTemplate = new PopupTemplate({
            title: String(graphic.attributes?.['name'] ?? parsed.name),
            content: [{ type: 'fields' }],
          });
        }

        uploadLayer.addMany(parsed.graphics);
        setLoaded((prev) => [...prev, parsed]);
        showToast(`Loaded ${parsed.graphics.length.toLocaleString()} features from ${file.name}.`, 'success');
      }

      if (uploadLayer.graphics.length > 0) {
        const geometries = uploadLayer.graphics
          .toArray()
          .map((g) => g.geometry)
          .filter((g): g is __esri.GeometryUnion => Boolean(g));
        await view.goTo({ target: geometries, padding: { top: 40, bottom: 40, left: 40, right: 40 } });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function clearAll(): void {
    uploadLayer.removeAll();
    setLoaded([]);
  }

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Add your own waypoints and tracks. Files are read <strong>in your browser</strong> —
        nothing is uploaded to any server.
      </p>

      <div
        className="hp-dropzone"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }}
        onDragLeave={(e) => e.currentTarget.classList.remove('is-over')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('is-over');
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={26} />
        <p>Drag files here, or</p>
        <button
          type="button"
          className="hp-btn hp-btn--primary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Reading…' : 'Choose files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hp-visually-hidden"
          accept={formats.map((f) => `.${f}`).join(',')}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <p className="hp-dropzone__hint">Supports {formats.join(', ').toUpperCase()}</p>
      </div>

      {loaded.length > 0 ? (
        <>
          <ul className="hp-uploads">
            {loaded.map((track, index) => (
              <li key={`${track.name}-${index}`} className="hp-uploads__item">
                <span className="hp-uploads__name">{track.name}</span>
                <span className="hp-uploads__counts">
                  {track.counts.points ? `${track.counts.points} waypoints` : null}
                  {track.counts.points && track.counts.lines ? ' · ' : null}
                  {track.counts.lines ? `${track.counts.lines} tracks` : null}
                  {track.counts.polygons ? ` · ${track.counts.polygons} areas` : null}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="hp-btn hp-btn--ghost" onClick={clearAll}>
            Remove all uploaded data
          </button>
        </>
      ) : null}
    </div>
  );
}
