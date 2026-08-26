/** Inline SVG icon set — no icon font, no external requests, themable via
 *  `currentColor`, and each one carries an accessible label when standalone. */
const PATHS: Record<string, string> = {
  layers: 'M12 2 2 7l10 5 10-5-10-5Zm0 9L2 16l10 5 10-5-10-5Z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c3 3 3 17 0 20M2 12h20M4 7h16M4 17h16',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 20h16',
  ruler: 'M3 9h18v6H3V9Zm4 0v3m4-3v3m4-3v3',
  pencil: 'M4 20h4L20 8l-4-4L4 16v4Z',
  printer: 'M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8v-7Z',
  link: 'M9 15 15 9m-3-4 1-1a4 4 0 1 1 6 6l-1 1m-6 6-1 1a4 4 0 1 1-6-6l1-1',
  download: 'M12 4v12m0 0-5-5m5 5 5-5M4 20h16',
  table: 'M3 5h18v14H3V5Zm0 5h18M9 10v9',
  crosshair: 'M12 2v4m0 12v4M2 12h4m12 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  close: 'M6 6l12 12M18 6 6 18',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  check: 'm5 13 4 4L19 7',
  deer: 'M7 3 5 7l3 2m9-6 2 4-3 2m-6 1a3 3 0 0 0 6 0m-6 0v3a3 3 0 0 0 6 0v-3m-3 6v6',
  tag: 'M3 3h8l10 10-8 8L3 11V3Zm4 4h.01',
  hash: 'M5 9h14M5 15h14M9 4 7 20m10-16-2 16',
  mountain: 'm3 19 6-11 4 7 3-4 5 8H3Z',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  calendar: 'M4 6h16v14H4V6Zm0 5h16M8 3v4m8-4v4',
  flame: 'M12 22c4 0 6-2.7 6-6 0-4-4-5-4-9 0 0-3 2-3 5 0-2-2-3-2-3s-3 3-3 7c0 3.3 2 6 6 6Z',
  boundary: 'M4 4h7v7H4V4Zm9 9h7v7h-7v-7ZM11 8h6m-6 0v5',
  road: 'M8 3 5 21m11-18 3 18M12 4v3m0 4v3m0 4v3',
  alert: 'M12 3 2 20h20L12 3Zm0 6v5m0 3h.01',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5h.01M11 11h2v6h-2v-6Z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  sliders: 'M4 6h10m4 0h2M4 12h2m4 0h10M4 18h10m4 0h2M14 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM6 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm8 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  refresh: 'M20 11a8 8 0 1 0-2 6m2 2v-6h-6',
};

export interface IconProps {
  name: keyof typeof PATHS | string;
  size?: number;
  label?: string;
  className?: string;
}

export function Icon({ name, size = 18, label, className }: IconProps): React.ReactElement {
  const d = PATHS[name] ?? PATHS['info']!;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      <path d={d} />
    </svg>
  );
}
