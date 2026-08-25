import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { Icon } from '@/components/Icon';

export function Header(): React.ReactElement {
  const config = useConfig();
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <header className="hp-header">
      <a className="hp-header__brand" href={config.app.huntPlannerUrl ?? '/'}>
        <Icon name="deer" size={24} className="hp-header__logo" />
        <span className="hp-header__titles">
          <span className="hp-header__title">{config.app.title}</span>
          {config.app.subtitle ? (
            <span className="hp-header__subtitle">{config.app.subtitle}</span>
          ) : null}
        </span>
      </a>

      <nav className="hp-header__nav" aria-label="Site">
        {config.app.huntPlannerUrl ? (
          <a href={config.app.huntPlannerUrl}>Search for a Hunt</a>
        ) : null}
        {config.app.rulesUrl ? <a href={config.app.rulesUrl}>Rules</a> : null}
        <button
          type="button"
          onClick={() => { setActiveTool('share'); setSidebarOpen(true); }}
        >
          Share
        </button>
        {config.app.helpUrl ? (
          <a href={config.app.helpUrl} target="_blank" rel="noopener noreferrer">
            Help
          </a>
        ) : null}
        {config.app.termsUrl ? (
          <a href={config.app.termsUrl} target="_blank" rel="noopener noreferrer">
            Disclaimer
          </a>
        ) : null}
      </nav>
    </header>
  );
}
