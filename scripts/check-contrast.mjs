#!/usr/bin/env node
/**
 * Audit the configured palettes against WCAG 2.2 AA.
 *
 *   node scripts/check-contrast.mjs [config/app.config.yml]
 *
 * The theme is config-driven, which is what makes a rebrand cheap — and also
 * what makes it easy to ship an inaccessible one by accident. This checks the
 * pairs the stylesheet actually renders, for both light and dark, and exits
 * non-zero on a failure so it can gate a deploy.
 *
 * Standard applied: WCAG 2.2 Level AA, which is what Section 508 incorporates
 * by reference for a public agency.
 *
 *   1.4.3  Contrast (Minimum)   body text          >= 4.5:1
 *                               large text (>=24px, or >=18.66px bold) >= 3:1
 *   1.4.11 Non-text Contrast    UI component boundaries, focus indicators,
 *                               and meaningful graphics >= 3:1
 *
 * Ratios are computed per WCAG's relative-luminance formula, so the numbers
 * here are the same ones an auditor's tool will report.
 */
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const AA_TEXT = 4.5;
const AA_LARGE = 3.0;
const AA_NONTEXT = 3.0;

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every pair below corresponds to something the stylesheet actually paints.
 * `kind` selects the threshold: text, large, or nontext.
 */
function pairsFor(t) {
  return [
    // --- body and secondary text -------------------------------------------
    { kind: 'text', fg: t.text, bg: t.surface, what: 'body text on surface' },
    { kind: 'text', fg: t.text, bg: t.surfaceAlt, what: 'body text on alt surface' },
    { kind: 'text', fg: t.text, bg: t.panel, what: 'body text on panel' },
    { kind: 'text', fg: t.textMuted, bg: t.surface, what: 'muted text on surface' },
    { kind: 'text', fg: t.textMuted, bg: t.surfaceAlt, what: 'muted text on alt surface' },
    { kind: 'text', fg: t.danger, bg: t.surface, what: 'error text on surface' },

    // --- text on filled chrome ---------------------------------------------
    { kind: 'text', fg: '#FFFFFF', bg: t.primary, what: 'header text on primary' },
    { kind: 'text', fg: '#FFFFFF', bg: t.primaryDark, what: 'text on primary dark' },
    { kind: 'text', fg: t.dangerInk, bg: t.danger, what: 'text on danger fill' },

    // --- accent used as text ------------------------------------------------
    { kind: 'text', fg: t.accentInk, bg: t.surface, what: 'link / accent text on surface' },
    { kind: 'text', fg: t.accentInk, bg: t.surfaceAlt, what: 'link / accent text on alt surface' },

    // --- non-text: control boundaries and indicators ------------------------
    { kind: 'nontext', fg: t.borderStrong, bg: t.surface, what: 'control border on surface' },
    { kind: 'nontext', fg: t.borderStrong, bg: t.surfaceAlt, what: 'control border on alt surface' },
    { kind: 'nontext', fg: t.accentBorder, bg: t.surface, what: 'active control border on surface' },
    { kind: 'nontext', fg: t.focusRing, bg: t.surface, what: 'focus ring on surface' },
    { kind: 'nontext', fg: t.focusRing, bg: t.surfaceAlt, what: 'focus ring on alt surface' },
    { kind: 'nontext', fg: t.focusRingInverse, bg: t.primary, what: 'focus ring on primary chrome' },
    { kind: 'nontext', fg: t.accent, bg: t.primary, what: 'gold keyline on primary' },
    { kind: 'nontext', fg: t.primaryMid, bg: t.surface, what: 'graphic / icon on surface' },
  ].filter((p) => p.fg && p.bg);
}

const threshold = (kind) =>
  kind === 'text' ? AA_TEXT : kind === 'large' ? AA_LARGE : AA_NONTEXT;

const RULE = { text: '1.4.3', large: '1.4.3', nontext: '1.4.11' };

function audit(label, theme) {
  const rows = pairsFor(theme).map((p) => {
    const r = ratio(p.fg, p.bg);
    const need = threshold(p.kind);
    return { ...p, r, need, pass: r >= need };
  });

  const fails = rows.filter((r) => !r.pass);
  console.log(`\n${label}`);
  console.log('-'.repeat(label.length));
  for (const r of rows) {
    const mark = r.pass ? 'ok  ' : 'FAIL';
    const num = r.r.toFixed(2).padStart(5);
    console.log(
      `  ${mark} ${num}:1  (needs ${r.need.toFixed(1)}, SC ${RULE[r.kind]})  ${r.what}`,
    );
    if (!r.pass) console.log(`         ${r.fg} on ${r.bg}`);
  }
  return fails;
}

const path = process.argv[2] ?? 'config/app.config.yml';
const raw = parse(await readFile(path, 'utf8'));
const light = raw?.ui?.theme;
const dark = raw?.ui?.themeDark;

if (!light) {
  console.error(`No ui.theme found in ${path}`);
  process.exit(1);
}

console.log(`Contrast audit — WCAG 2.2 AA  (${path})`);

const fails = [
  ...audit('LIGHT', light),
  ...(dark ? audit('DARK', dark) : []),
];

console.log('');
if (fails.length === 0) {
  console.log('All pairs meet WCAG 2.2 AA.');
} else {
  console.log(`${fails.length} pair(s) below AA:`);
  for (const f of fails) {
    console.log(`  - ${f.what}: ${f.r.toFixed(2)}:1, needs ${f.need.toFixed(1)}:1`);
  }
  console.log('\nFix the token in ui.theme / ui.themeDark, not the stylesheet.');
}

process.exitCode = fails.length > 0 ? 1 : 0;
