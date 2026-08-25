import { useAppStore } from '@/state/store';
import { useConfig } from '@/config/ConfigContext';
import { Icon } from '@/components/Icon';

const STATUS_COPY = {
  ok: { label: 'Responding', tone: 'ok' },
  fallback: { label: 'Using fallback', tone: 'warn' },
  failed: { label: 'Not responding', tone: 'error' },
} as const;

/**
 * New in this version. The previous Map Center had no way to see that a service
 * had gone away — the GeoMAC fire layers were dead for roughly five years before
 * anyone noticed and commented them out.
 */
export function HealthPanel(): React.ReactElement {
  const config = useConfig();
  const health = useAppStore((s) => s.health);

  const failed = health.filter((h) => h.status === 'failed');
  const fallback = health.filter((h) => h.status === 'fallback');
  const ok = health.filter((h) => h.status === 'ok');
  const replaced = config.layers.filter((l) => l.health === 'replaced');

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Live status of every map service this application depends on.
      </p>

      <dl className="hp-stats">
        <div><dt>Responding</dt><dd>{ok.length}</dd></div>
        <div><dt>Fallback</dt><dd>{fallback.length}</dd></div>
        <div><dt>Failed</dt><dd className={failed.length ? 'is-error' : ''}>{failed.length}</dd></div>
      </dl>

      {replaced.length > 0 ? (
        <div className="hp-alert hp-alert--info">
          <Icon name="info" size={16} />
          <span>
            {replaced.length} layer{replaced.length === 1 ? '' : 's'} now use a replacement
            service because the original was retired upstream.
          </span>
        </div>
      ) : null}

      <ul className="hp-health">
        {[...failed, ...fallback, ...ok].map((entry) => {
          const copy = STATUS_COPY[entry.status];
          return (
            <li key={entry.layerId} className={`hp-health__row is-${copy.tone}`}>
              <div className="hp-health__head">
                <span className={`hp-dot hp-dot--${copy.tone}`} aria-hidden="true" />
                <span className="hp-health__title">{entry.title}</span>
                <span className="hp-health__status">{copy.label}</span>
              </div>
              <code className="hp-health__url">{entry.url}</code>
              {entry.message ? <p className="hp-health__message">{entry.message}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
