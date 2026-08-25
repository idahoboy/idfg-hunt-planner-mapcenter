import { useEffect, useState } from 'react';
import Print from '@arcgis/core/widgets/Print';
import { useConfig } from '@/config/ConfigContext';
import { useMap } from '@/map/MapProvider';
import { useAppStore } from '@/state/store';
import { Icon } from '@/components/Icon';
import { useWidgetContainer } from '@/map/useWidgetContainer';

interface PrintToolConfig {
  serviceUrl?: string;
  layouts?: Array<{ value: string; label: string }>;
  formats?: string[];
  defaultLayout?: string;
  defaultFormat?: string;
  includeLegend?: boolean;
}

export function PrintPanel(): React.ReactElement {
  const config = useConfig();
  const { view, ready } = useMap();
  const basemapId = useAppStore((s) => s.basemapId);
  const [hostRef, makeContainer] = useWidgetContainer();
  const [failed, setFailed] = useState(false);

  const tool = (config.tools['print'] ?? {}) as PrintToolConfig;
  const basemap = config.basemaps.items.find((b) => b.id === basemapId);
  const printableBasemap = basemap?.printable ?? true;

  useEffect(() => {
    if (!ready || !view || !hostRef.current || !tool.serviceUrl) return;
    const container = makeContainer();
    if (!container) return;

    const widget = new Print({
      view,
      container,
      printServiceUrl: tool.serviceUrl,
      templateOptions: ({
        title: 'Idaho Hunt Planner Map',
        author: 'Idaho Department of Fish and Game',
        copyright: `© ${new Date().getFullYear()} Idaho Department of Fish and Game`,
        legendEnabled: tool.includeLegend ?? true,
        ...(tool.defaultLayout ? { layout: tool.defaultLayout } : {}),
        ...(tool.defaultFormat ? { format: tool.defaultFormat } : {}),
      } as unknown) as __esri.TemplateOptions,
    });

    // Surface a dead print service instead of spinning forever, which is what
    // the legacy deferred-errback path did.
    widget.when(
      () => setFailed(false),
      () => setFailed(true),
    );

    return () => widget.destroy();
  }, [ready, view, makeContainer, hostRef, tool.serviceUrl, tool.defaultLayout, tool.defaultFormat, tool.includeLegend]);

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Export the current map view as a PDF or image, ready to print and carry.
      </p>

      {!printableBasemap ? (
        <div className="hp-alert hp-alert--warn" role="status">
          <Icon name="alert" size={16} />
          <span>This basemap cannot be printed. Switch to a raster basemap first.</span>
        </div>
      ) : null}

      {failed ? (
        <div className="hp-alert hp-alert--error" role="alert">
          <Icon name="alert" size={16} />
          <span>
            The IDFG print service is not responding. Use your browser&apos;s own print
            (Ctrl/Cmd&nbsp;+&nbsp;P) as a fallback.
          </span>
        </div>
      ) : null}

      <div ref={hostRef} className="hp-esri-widget" />
    </div>
  );
}
