import type { ResultRecord } from '@/state/store';

/** RFC 4180 quoting. The legacy CSV export concatenated raw values, so any
 *  hunt area note containing a comma shifted every later column. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(records: ResultRecord[]): string {
  if (records.length === 0) return '';

  const attributeKeys = [...new Set(records.flatMap((r) => Object.keys(r.attributes)))]
    .filter((k) => !/^(Shape|SHAPE|GlobalID|OBJECTID)/i.test(k))
    .sort();

  const header = ['Source', 'ID', 'Title', 'Detail', ...attributeKeys];
  const rows = records.map((r) => [
    r.sourceTitle, r.id, r.title, r.subtitle,
    ...attributeKeys.map((k) => r.attributes[k]),
  ]);

  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export function downloadCsv(records: ResultRecord[], filename: string): void {
  // BOM so Excel opens UTF-8 place names correctly.
  const blob = new Blob(['﻿', toCsv(records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
