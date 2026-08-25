import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer';
import LabelClass from '@arcgis/core/layers/support/LabelClass';
import type { LayerConfig } from '@/config/schema';

type SymbolCfg = NonNullable<LayerConfig['renderer']>['symbol'];
type LabelCfg = NonNullable<LayerConfig['labels']>;

const LINE_STYLES = new Set([
  'solid', 'dash', 'dot', 'dash-dot', 'long-dash', 'long-dash-dot',
  'long-dash-dot-dot', 'short-dash', 'short-dot', 'short-dash-dot', 'none',
]);

const FILL_STYLES = new Set([
  'solid', 'backward-diagonal', 'cross', 'diagonal-cross', 'forward-diagonal',
  'horizontal', 'vertical', 'none',
]);

function lineStyle(style?: string): __esri.SimpleLineSymbolProperties['style'] {
  return style && LINE_STYLES.has(style)
    ? (style as __esri.SimpleLineSymbolProperties['style'])
    : 'solid';
}

export type BuiltSymbol = SimpleFillSymbol | SimpleLineSymbol | SimpleMarkerSymbol;

export function buildSymbol(cfg: SymbolCfg): BuiltSymbol {
  const outline = cfg.outline
    ? new SimpleLineSymbol({
        color: cfg.outline.color,
        width: cfg.outline.width,
        style: lineStyle(cfg.outline.style),
      })
    : undefined;

  switch (cfg.type) {
    case 'line':
      return new SimpleLineSymbol({
        color: cfg.color ?? '#000000',
        width: cfg.width ?? 1,
        style: lineStyle(cfg.style),
      });
    case 'marker':
      return new SimpleMarkerSymbol({
        color: cfg.color ?? '#ff0000',
        size: cfg.size ?? 8,
        ...(outline ? { outline } : {}),
      });
    case 'fill':
    default:
      return new SimpleFillSymbol({
        color: cfg.color ?? 'rgba(0,0,0,0.25)',
        style:
          cfg.style && FILL_STYLES.has(cfg.style)
            ? (cfg.style as __esri.SimpleFillSymbolProperties['style'])
            : 'solid',
        ...(outline ? { outline } : {}),
      });
  }
}

export function buildRenderer(cfg: NonNullable<LayerConfig['renderer']>): SimpleRenderer {
  return new SimpleRenderer({ symbol: buildSymbol(cfg.symbol) });
}

export function buildLabelClass(cfg: LabelCfg): LabelClass {
  return new LabelClass({
    labelExpressionInfo: { expression: `$feature.${cfg.field}` },
    symbol: new TextSymbol({
      color: cfg.color,
      haloColor: cfg.haloColor,
      haloSize: cfg.haloSize,
      font: {
        size: cfg.size,
        family: 'Lato, Arial, sans-serif',
        weight: cfg.weight,
      },
    }),
    ...(cfg.minScale !== undefined ? { minScale: cfg.minScale } : {}),
    ...(cfg.maxScale !== undefined ? { maxScale: cfg.maxScale } : {}),
    labelPlacement: 'always-horizontal',
    deconflictionStrategy: 'static',
  });
}
