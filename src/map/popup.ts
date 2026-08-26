import PopupTemplate from '@arcgis/core/PopupTemplate';
import type { PopupConfig } from '@/config/schema';

const TRUTHY = new Set(['y', 'yes', 'true', '1', 't']);

export function isTruthy(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return TRUTHY.has(value.trim().toLowerCase());
  return false;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatAttr(raw: unknown, format?: string, suffix?: string): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  let out: string;
  switch (format) {
    case 'number': {
      const n = Number(raw);
      out = Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(raw);
      break;
    }
    case 'date': {
      const n = typeof raw === 'number' ? raw : Date.parse(String(raw));
      out = Number.isFinite(n) ? new Date(n).toLocaleDateString() : String(raw);
      break;
    }
    default:
      out = String(raw);
  }
  return escapeHtml(out) + (suffix ? escapeHtml(suffix) : '');
}

/**
 * Legacy popups were built by string-concatenating `${FIELD}` into HTML, which
 * meant any field containing a quote or angle bracket broke the markup (and any
 * field containing a script tag did worse). This builds DOM-safe content via a
 * function template, escaping every attribute value.
 */
export function buildPopupTemplate(cfg: PopupConfig, fallbackTitle: string): PopupTemplate {
  return new PopupTemplate({
    title: cfg.title ?? fallbackTitle,
    outFields: ['*'],
    content: (feature: { graphic: __esri.Graphic }) => {
      const attrs = (feature.graphic?.attributes ?? {}) as Record<string, unknown>;
      const root = document.createElement('div');
      root.className = 'hp-popup';

      if (cfg.content) {
        const intro = document.createElement('p');
        intro.className = 'hp-popup__intro';
        intro.textContent = cfg.content;
        root.append(intro);
      }

      if (cfg.fields?.length) {
        const dl = document.createElement('dl');
        dl.className = 'hp-popup__fields';
        for (const f of cfg.fields) {
          const raw = attrs[f.field];
          if (raw === null || raw === undefined || raw === '') continue;
          const dt = document.createElement('dt');
          dt.textContent = f.label;
          const dd = document.createElement('dd');
          dd.innerHTML = formatAttr(raw, f.format, f.suffix);
          if (f.note) {
            const note = document.createElement('span');
            note.className = 'hp-popup__note';
            note.textContent = ` (${f.note})`;
            dd.append(note);
          }
          dl.append(dt, dd);
        }
        if (dl.childElementCount > 0) root.append(dl);
      }

      if (cfg.badges?.length) {
        const allowed = cfg.badges.filter((b) => isTruthy(attrs[b.field]));
        if (allowed.length) {
          const wrap = document.createElement('div');
          wrap.className = 'hp-popup__badges';
          const heading = document.createElement('span');
          heading.className = 'hp-popup__badges-label';
          heading.textContent = 'Allowed:';
          wrap.append(heading);
          for (const b of allowed) {
            const chip = document.createElement('span');
            chip.className = 'hp-chip hp-chip--ok';
            chip.textContent = b.label;
            wrap.append(chip);
          }
          root.append(wrap);
        }
      }

      if (cfg.warnings?.length) {
        const active = cfg.warnings.filter((w) => isTruthy(attrs[w.field]));
        if (active.length) {
          const ul = document.createElement('ul');
          ul.className = 'hp-popup__warnings';
          for (const w of active) {
            const li = document.createElement('li');
            li.textContent = w.label;
            ul.append(li);
          }
          root.append(ul);
        }
      }

      if (cfg.links?.length) {
        const nav = document.createElement('div');
        nav.className = 'hp-popup__links';
        for (const link of cfg.links) {
          const href = link.url ?? (link.field ? String(attrs[link.field] ?? '') : '');
          if (!href || !/^https?:\/\//i.test(href)) continue;
          const a = document.createElement('a');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = link.label;
          nav.append(a);
        }
        if (nav.childElementCount > 0) root.append(nav);
      }

      return root;
    },
  });
}
