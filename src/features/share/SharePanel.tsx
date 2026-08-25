import { useState } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useMap } from '@/map/MapProvider';
import { useAppStore } from '@/state/store';
import { buildShareUrl } from '@/state/urlState';
import { Icon } from '@/components/Icon';

/**
 * New in this version. The legacy app could be deep-linked *into* from the Hunt
 * Planner search results, but gave the user no way to produce a link to what
 * they were currently looking at.
 */
export function SharePanel(): React.ReactElement {
  const config = useConfig();
  const { view } = useMap();
  const layerVisibility = useAppStore((s) => s.layerVisibility);
  const basemapId = useAppStore((s) => s.basemapId);
  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);
  const showToast = useAppStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);

  const center = view?.center;
  const url = buildShareUrl({
    config,
    layerVisibility,
    basemapId,
    center: [center?.longitude ?? config.map.center[0], center?.latitude ?? config.map.center[1]],
    zoom: view?.zoom ?? config.map.zoom,
    filters,
    keyword,
  });

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Could not copy. Select the link and copy it manually.', 'error');
    }
  }

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        This link reopens the map exactly as you see it now — same layers, same
        basemap, same filters, same view.
      </p>

      <div className="hp-field">
        <label className="hp-field__label" htmlFor="share-url">Link</label>
        <textarea id="share-url" className="hp-textarea" readOnly rows={4} value={url} />
      </div>

      <div className="hp-panel__actions">
        <button type="button" className="hp-btn hp-btn--primary" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'link'} size={15} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <p className="hp-panel__hint">
        Layer selections are encoded the same way the previous Map Center encoded
        them, so links you have already shared keep working.
      </p>
    </div>
  );
}
