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

  const columns: Array<[string, (r: ResultRecord) => unknown]> = [
    ['Tag', (r) => r.title],
    ['Species', (r) => r.species],
    ['Hunt type', (r) => (r.type === 'general' ? 'General season' : 'Controlled hunt')],
    ['Opens', (r) => r.open],
    ['Closes', (r) => r.close],
    ['Weapon', (r) => r.method],
    ['Sex / antler', (r) => r.ornament],
    ['Tags', (r) => (r.unlimited ? 'Unlimited' : r.permits)],
    ['Area', (r) => r.area],
    ['Units referenced', (r) => r.unitsReferenced.join(' ')],
    ['Area is partial', (r) => (r.areaQualified ? 'yes' : 'no')],
    ['Access', (r) => r.accessGrade],
    ['Hunt id', (r) => r.huntId],
    ['Tag id', (r) => r.tagId],
  ];

  const rows = [
    columns.map(([label]) => label),
    ...records.map((r) => columns.map(([, get]) => get(r))),
  ];

  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export function downloadCsv(records: ResultRecord[], filename: string): void {
  const columns: Array<[string, (r: ResultRecord) => string | number | null]> = [
    ['Tag', (r) => r.title],
    ['Species', (r) => r.species],
    ['Hunt type', (r) => (r.type === 'general' ? 'General season' : 'Controlled hunt')],
    ['Opens', (r) => r.open],
    ['Closes', (r) => r.close],
    ['Weapon', (r) => r.method],
    ['Sex / antler', (r) => r.ornament],
    ['Tags', (r) => (r.unlimited ? 'Unlimited' : r.permits)],
    ['Area', (r) => r.area],
    ['Units referenced', (r) => r.unitsReferenced.join(' ')],
    ['Access', (r) => r.accessGrade],
    ['Area is partial', (r) => (r.areaQualified ? 'yes' : 'no')],
    ['Hunt id', (r) => r.huntId],
    ['Tag id', (r) => r.tagId],
  ];

  const rows = [
    columns.map(([label]) => label),
    ...records.map((r) => columns.map(([, get]) => get(r))),
  ];

  // RFC 4180 quoting: the legacy export concatenated raw values, so any hunt
  // area note containing a comma shifted every later column.
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const v = cell === null || cell === undefined ? '' : String(cell);
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(','),
    )
    .join('\r\n');

  // BOM so Excel reads it as UTF-8 rather than mangling the en dashes.
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
