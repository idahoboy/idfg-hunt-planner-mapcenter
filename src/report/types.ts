/**
 * The shape `scripts/diff-snapshots.mjs` writes to public/changes.json.
 *
 * Hand-written rather than generated because the differ is plain Node and the
 * page is the only consumer; if the two drift, the page shows its "cannot read
 * this report" state rather than rendering something wrong.
 */

export interface CaptureRef {
  file: string;
  at: string;
  hash: string;
}

export interface ArchiveEntry extends CaptureRef {
  kind: string;
  unchanged: boolean;
  bytes: number;
}

export interface HuntRow {
  id: number;
  tagId: number | null;
  tag: string;
  species: string | null;
  type: string | null;
  area: string | null;
  method: string | null;
  open: string | null;
  close: string | null;
}

export interface FieldChange {
  field: string;
  label: string;
  major: boolean;
  before: string;
  after: string;
}

export interface ChangedHunt extends HuntRow {
  fields: FieldChange[];
  major: boolean;
}

export interface SetDiff {
  added: string[];
  removed: string[];
}

export interface InventoryComparison {
  kind: 'inventory';
  asOf: string;
  from: CaptureRef;
  to: CaptureRef;
  spanDays: number;
  probableRollover: boolean;
  totals: {
    before: number;
    after: number;
    added: number;
    expired: number;
    withdrawn: number;
    changed: number;
    changedMajor: number;
  };
  added: HuntRow[];
  withdrawn: HuntRow[];
  expired: HuntRow[];
  changed: ChangedHunt[];
  vocabulary: Record<string, SetDiff>;
  counts: { metric: string; before: number; after: number }[];
  dataQuality: {
    unmappable: SetDiff & { before: number; after: number };
    ambiguous: SetDiff & { before: number; after: number };
  };
}

export interface ServiceRow {
  url: string;
  label: string;
  role: string;
  name: string | null;
  reachable: boolean;
  detail?: string;
  stillDown?: boolean;
}

export interface ReshapedService extends ServiceRow {
  fieldsAdded: string[];
  fieldsRemoved: string[];
  changes: { what: string; before: string; after: string }[];
  major: boolean;
}

export interface ServicesComparison {
  kind: 'services';
  from: CaptureRef;
  to: CaptureRef;
  spanDays: number;
  totals: {
    before: number;
    after: number;
    gained: number;
    lost: number;
    broke: number;
    recovered: number;
    reshaped: number;
    unreachableNow: number;
  };
  gained: ServiceRow[];
  lost: ServiceRow[];
  broke: ServiceRow[];
  recovered: ServiceRow[];
  reshaped: ReshapedService[];
  unreachable: ServiceRow[];
}

export interface Unavailable {
  unavailable: string;
  baseline?: ArchiveEntry;
}

export interface ChangeReport {
  generated: string;
  archive: ArchiveEntry[];
  comparisons: {
    inventory?: InventoryComparison | Unavailable;
    services?: ServicesComparison | Unavailable;
  };
}

export const isUnavailable = (c: unknown): c is Unavailable =>
  typeof c === 'object' && c !== null && 'unavailable' in c;
