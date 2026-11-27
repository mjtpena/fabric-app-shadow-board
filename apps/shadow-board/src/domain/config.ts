import type { AssetCondition, AssetKind } from '../model';

/** Reimaging / turnaround buffer in business days after a loan returns. */
export const BUFFER_BUSINESS_DAYS: Record<AssetKind, number> = {
  laptop: 2,
  phone: 1,
  hotspot: 1,
  headset: 1,
  'security-key': 1,
  monitor: 1,
};

/** Maximum length of a single loan (including extensions) in calendar days. */
export const MAX_LOAN_DAYS = 21;

/** Overdue escalation ladder in calendar days relative to dueOn. */
export const OVERDUE_LADDER = {
  reminder: -1,
  overdue: 1,
  manager: 3,
  presumedLost: 14,
} as const;

/** Numeric rank for condition comparison (higher = better). */
export const CONDITION_RANK: Record<AssetCondition, number> = {
  repair: 0,
  worn: 1,
  good: 2,
  new: 3,
};

/** Human-readable labels for asset kinds. */
export const KIND_LABEL: Record<AssetKind, string> = {
  laptop: 'Laptop',
  phone: 'Phone',
  hotspot: 'Hotspot',
  'security-key': 'Security key',
  headset: 'Headset',
  monitor: 'Monitor',
};

/** Human-readable labels for conditions. */
export const CONDITION_LABEL: Record<AssetCondition, string> = {
  new: 'New',
  good: 'Good',
  worn: 'Worn',
  repair: 'Repair',
};

/** Default holiday dates (YYYY-MM-DD) for a given reference year (winter break). */
export function holidaysForYear(year: number): string[] {
  return [
    `${year}-12-25`,
    `${year}-12-26`,
    `${year + 1}-01-01`,
    `${year}-01-01`,
  ];
}
