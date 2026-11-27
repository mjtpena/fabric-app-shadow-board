import type { Asset, AssetCondition, AssetKind, Handover, Loan } from '../model';
import { BUFFER_BUSINESS_DAYS, CONDITION_RANK, MAX_LOAN_DAYS, OVERDUE_LADDER } from './config';

// ── Date utilities (UTC YYYY-MM-DD) ───────────────────────────────────────────

export function toDayStr(input: string | Date): string {
  if (typeof input === 'string') return input.slice(0, 10);
  return input.toISOString().slice(0, 10);
}

export function parseDay(dayStr: string): Date {
  const [y, m, d] = dayStr.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(dayStr: string, days: number): string {
  const dt = parseDay(dayStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toDayStr(dt);
}

export function diffDays(a: string, b: string): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function isWeekend(dayStr: string): boolean {
  const dow = parseDay(dayStr).getUTCDay();
  return dow === 0 || dow === 6;
}

export function isBusinessDay(dayStr: string, holidays: readonly string[]): boolean {
  const d = toDayStr(dayStr);
  return !isWeekend(d) && !holidays.includes(d);
}

export function addBusinessDays(dayStr: string, count: number, holidays: readonly string[]): string {
  let cur = toDayStr(dayStr);
  let remaining = count;
  while (remaining > 0) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur, holidays)) remaining -= 1;
  }
  return cur;
}

export function nextBusinessDay(dayStr: string, holidays: readonly string[]): string {
  let cur = toDayStr(dayStr);
  while (!isBusinessDay(cur, holidays)) {
    cur = addDays(cur, 1);
  }
  return cur;
}

/**
 * Returns the last holiday inside (startsOn, dueOn] if the loan spans any holiday,
 * or null if it does not.
 */
export function lastSpannedHoliday(startsOn: string, dueOn: string, holidays: readonly string[]): string | null {
  const s = toDayStr(startsOn);
  const e = toDayStr(dueOn);
  const spanned = holidays.filter((h) => h >= s && h <= e).sort();
  return spanned.length > 0 ? spanned[spanned.length - 1] : null;
}

/**
 * Rule 3: A loan that spans the holiday list is due on the first business day after it
 * (if its requested dueOn falls on a holiday or weekend immediately following it).
 */
export function adjustDueForHoliday(startsOn: string, dueOn: string, holidays: readonly string[]): string {
  const s = toDayStr(startsOn);
  const e = toDayStr(dueOn);
  const lastHol = lastSpannedHoliday(s, e, holidays);
  if (!lastHol) return e;
  const firstAfter = nextBusinessDay(addDays(lastHol, 1), holidays);
  return e < firstAfter ? firstAfter : e;
}

// ── Rule 1: Availability with buffers ─────────────────────────────────────────

export function bufferEndDate(returnOrDueDay: string, kind: AssetKind, holidays: readonly string[]): string {
  const days = BUFFER_BUSINESS_DAYS[kind] ?? 1;
  return addBusinessDays(toDayStr(returnOrDueDay), days, holidays);
}

export function loanHandovers(loanId: string, handovers: readonly Handover[]): {
  out: Handover | null;
  in: Handover | null;
} {
  let outH: Handover | null = null;
  let inH: Handover | null = null;
  for (const h of handovers) {
    if (h.loanId !== loanId) continue;
    if (h.kind === 'out') outH = h;
    if (h.kind === 'in') inH = h;
  }
  return { out: outH, in: inH };
}

/**
 * Occupied interval [start, occupiedUntil] inclusive for a loan, including turnaround buffer.
 * The asset is free again starting on `addDays(occupiedUntil, 1)`.
 */
export function loanOccupiedInterval(
  loan: Loan,
  kind: AssetKind,
  handovers: readonly Handover[],
  holidays: readonly string[],
): { start: string; loanEnd: string; bufferEnd: string; returned: boolean; handedOut: boolean } {
  const { out: outH, in: inH } = loanHandovers(loan.id, handovers);
  const start = toDayStr(loan.startsOn);
  const loanEnd = inH ? toDayStr(inH.at) : toDayStr(loan.dueOn);
  const bufferEnd = bufferEndDate(loanEnd, kind, holidays);
  return { start, loanEnd, bufferEnd, returned: !!inH, handedOut: !!outH };
}

export interface AvailabilityResult {
  free: boolean;
  nextFreeDate: string | null;
  reason?: string;
}

/**
 * Rule 1: An asset is free for [start, end] only if it is not in repair and no other loan,
 * extended by its turnaround buffer, overlaps [start, end].
 */
export function isAssetFree(
  asset: Asset,
  loans: readonly Loan[],
  handovers: readonly Handover[],
  start: string,
  end: string,
  holidays: readonly string[],
  excludeLoanId?: string,
): AvailabilityResult {
  if (asset.condition === 'repair') {
    return { free: false, nextFreeDate: null, reason: 'Asset is currently in repair.' };
  }
  const reqStart = toDayStr(start);
  const reqEnd = toDayStr(end);
  const reqBufEnd = bufferEndDate(reqEnd, asset.kind, holidays);

  const intervals = loans
    .filter((l) => l.assetId === asset.id && l.id !== excludeLoanId)
    .map((l) => loanOccupiedInterval(l, asset.kind, handovers, holidays))
    .sort((a, b) => a.start.localeCompare(b.start));

  for (const iv of intervals) {
    // Existing loan occupies [iv.start, iv.bufferEnd]; new loan + its buffer occupies [reqStart, reqBufEnd]
    const overlapsExisting = reqStart <= iv.bufferEnd && reqEnd >= iv.start;
    const newBufferClashesNext = reqStart <= iv.start && reqBufEnd >= iv.start;
    if (overlapsExisting || newBufferClashesNext) {
      // Find next free date after all contiguous clashes
      let candidate = addDays(iv.bufferEnd, 1);
      const duration = Math.max(0, diffDays(reqStart, reqEnd));
      for (const later of intervals) {
        const candEnd = addDays(candidate, duration);
        const candBufEnd = bufferEndDate(candEnd, asset.kind, holidays);
        if (candidate <= later.bufferEnd && candBufEnd >= later.start) {
          candidate = addDays(later.bufferEnd, 1);
        }
      }
      return {
        free: false,
        nextFreeDate: candidate,
        reason: `Overlaps existing loan or turnaround buffer (free from ${candidate}).`,
      };
    }
  }

  return { free: true, nextFreeDate: reqStart };
}

// ── Rule 2: Best-fit allocation ───────────────────────────────────────────────

export interface AllocationRequest {
  kind: AssetKind;
  startsOn: string;
  dueOn: string;
  minCondition?: AssetCondition;
}

export interface BestFitCandidate {
  asset: Asset;
  gapBefore: number;
  gapAfter: number;
  totalGap: number;
  conditionRank: number;
}

const MAX_GAP_CAP = 60;

/**
 * Rule 2: Choose the free asset of the requested kind and >= minCondition whose
 * total idle gap before and after [startsOn, dueOn] is smallest, breaking ties
 * by lowest condition-adequate wear (worn < good < new).
 */
export function rankBestFitAssets(
  assets: readonly Asset[],
  loans: readonly Loan[],
  handovers: readonly Handover[],
  req: AllocationRequest,
  holidays: readonly string[],
): BestFitCandidate[] {
  const minRank = CONDITION_RANK[req.minCondition ?? 'worn'];
  const reqStart = toDayStr(req.startsOn);
  const reqEnd = toDayStr(req.dueOn);
  const reqBufEnd = bufferEndDate(reqEnd, req.kind, holidays);

  const candidates: BestFitCandidate[] = [];

  for (const asset of assets) {
    if (asset.kind !== req.kind) continue;
    if (asset.condition === 'repair') continue;
    if (CONDITION_RANK[asset.condition] < minRank) continue;

    const avail = isAssetFree(asset, loans, handovers, reqStart, reqEnd, holidays);
    if (!avail.free) continue;

    const intervals = loans
      .filter((l) => l.assetId === asset.id)
      .map((l) => loanOccupiedInterval(l, asset.kind, handovers, holidays));

    let gapBefore = MAX_GAP_CAP;
    let gapAfter = MAX_GAP_CAP;

    for (const iv of intervals) {
      if (iv.bufferEnd < reqStart) {
        const g = Math.max(0, diffDays(iv.bufferEnd, reqStart) - 1);
        if (g < gapBefore) gapBefore = g;
      }
      if (iv.start > reqBufEnd) {
        const g = Math.max(0, diffDays(reqBufEnd, iv.start) - 1);
        if (g < gapAfter) gapAfter = g;
      }
    }

    candidates.push({
      asset,
      gapBefore,
      gapAfter,
      totalGap: gapBefore + gapAfter,
      conditionRank: CONDITION_RANK[asset.condition],
    });
  }

  candidates.sort((a, b) => {
    if (a.totalGap !== b.totalGap) return a.totalGap - b.totalGap;
    if (a.conditionRank !== b.conditionRank) return a.conditionRank - b.conditionRank;
    return a.asset.tag.localeCompare(b.asset.tag);
  });

  return candidates;
}

export function bestFitAsset(
  assets: readonly Asset[],
  loans: readonly Loan[],
  handovers: readonly Handover[],
  req: AllocationRequest,
  holidays: readonly string[],
): BestFitCandidate | null {
  return rankBestFitAssets(assets, loans, handovers, req, holidays)[0] ?? null;
}

// ── Rule 3: Limits and extensions ─────────────────────────────────────────────

export function validateLoanDates(
  startsOn: string,
  dueOn: string,
  holidays: readonly string[],
): { ok: boolean; adjustedDueOn: string; error?: string } {
  const s = toDayStr(startsOn);
  const rawE = toDayStr(dueOn);
  if (rawE < s) {
    return { ok: false, adjustedDueOn: rawE, error: 'Due date must be on or after the start date.' };
  }
  const adjustedDueOn = adjustDueForHoliday(s, rawE, holidays);
  const length = diffDays(s, adjustedDueOn);
  if (length > MAX_LOAN_DAYS) {
    return {
      ok: false,
      adjustedDueOn,
      error: `Maximum loan length is ${MAX_LOAN_DAYS} days (requested ${length} days).`,
    };
  }
  return { ok: true, adjustedDueOn };
}

export function canExtendLoan(
  loan: Loan,
  newDueOn: string,
  asset: Asset,
  loans: readonly Loan[],
  handovers: readonly Handover[],
  holidays: readonly string[],
): { ok: boolean; adjustedDueOn: string; error?: string } {
  const s = toDayStr(loan.startsOn);
  const curDue = toDayStr(loan.dueOn);
  const reqDue = toDayStr(newDueOn);
  if (reqDue <= curDue) {
    return { ok: false, adjustedDueOn: reqDue, error: 'Extension date must be after the current due date.' };
  }
  const dateCheck = validateLoanDates(s, reqDue, holidays);
  if (!dateCheck.ok) return dateCheck;

  const avail = isAssetFree(asset, loans, handovers, s, dateCheck.adjustedDueOn, holidays, loan.id);
  if (!avail.free) {
    return { ok: false, adjustedDueOn: dateCheck.adjustedDueOn, error: avail.reason ?? 'Extension clashes with a later booking.' };
  }
  return { ok: true, adjustedDueOn: dateCheck.adjustedDueOn };
}

// ── Rule 4: Return inspection ─────────────────────────────────────────────────

export function parseKit(kit: string): string[] {
  return kit
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ReturnInspection {
  needsRepair: boolean;
  missingKit: string[];
  conditionDropped: boolean;
  kitOk: boolean;
}

export function evaluateReturn(
  outCondition: AssetCondition,
  returnCondition: AssetCondition,
  expectedKit: string,
  returnedItems: readonly string[],
): ReturnInspection {
  const expected = parseKit(expectedKit);
  const returnedSet = new Set(returnedItems.map((s) => s.trim().toLowerCase()));
  const missingKit = expected.filter((item) => !returnedSet.has(item.toLowerCase()));
  const conditionDropped = CONDITION_RANK[returnCondition] < CONDITION_RANK[outCondition];
  const kitOk = missingKit.length === 0;
  const needsRepair = returnCondition === 'repair' || conditionDropped || !kitOk;
  return { needsRepair, missingKit, conditionDropped, kitOk };
}

// ── Rule 5: Overdue ladder & utilisation ──────────────────────────────────────

export type OverdueStage = 'none' | 'reminder' | 'overdue' | 'manager' | 'presumed-lost';

export function overdueStage(dueOn: string, todayStr: string, isReturned: boolean): OverdueStage {
  if (isReturned) return 'none';
  const delta = diffDays(toDayStr(dueOn), toDayStr(todayStr));
  if (delta >= OVERDUE_LADDER.presumedLost) return 'presumed-lost';
  if (delta >= OVERDUE_LADDER.manager) return 'manager';
  if (delta >= OVERDUE_LADDER.overdue) return 'overdue';
  if (delta === OVERDUE_LADDER.reminder) return 'reminder';
  return 'none';
}

export type BoardStatus = 'in' | 'out' | 'overdue' | 'reimaging' | 'repair';

export interface AssetDaySnapshot {
  asset: Asset;
  status: BoardStatus;
  activeLoan: Loan | null;
  borrowerInitials: string | null;
  dueOn: string | null;
  bufferEndsOn: string | null;
  overdueStage: OverdueStage;
  nextFreeDate: string | null;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Single source of truth for both the Shadow Board SVG and the List table.
 * Computes an asset's exact status on `dateStr` (YYYY-MM-DD).
 */
export function assetStatusOnDate(
  asset: Asset,
  loans: readonly Loan[],
  handovers: readonly Handover[],
  dateStr: string,
  todayStr: string,
  holidays: readonly string[],
): AssetDaySnapshot {
  const d = toDayStr(dateStr);
  if (asset.condition === 'repair') {
    return {
      asset,
      status: 'repair',
      activeLoan: null,
      borrowerInitials: null,
      dueOn: null,
      bufferEndsOn: null,
      overdueStage: 'none',
      nextFreeDate: null,
    };
  }

  const assetLoans = loans
    .filter((l) => l.assetId === asset.id)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  // Check overdue first (unreturned loan whose dueOn < d and startsOn <= d)
  for (const loan of assetLoans) {
    const iv = loanOccupiedInterval(loan, asset.kind, handovers, holidays);
    const dueDay = toDayStr(loan.dueOn);

    // If unreturned and past due on the selected date (and loan started on or before todayStr)
    if (!iv.returned && iv.start <= d && d > dueDay && dueDay < todayStr && d <= todayStr) {
      return {
        asset,
        status: 'overdue',
        activeLoan: loan,
        borrowerInitials: initialsOf(loan.borrowerName),
        dueOn: dueDay,
        bufferEndsOn: iv.bufferEnd,
        overdueStage: overdueStage(dueDay, d, false),
        nextFreeDate: addDays(bufferEndDate(d, asset.kind, holidays), 1),
      };
    }

    // Active loan on date d
    if (d >= iv.start && d <= iv.loanEnd) {
      const stage = !iv.returned && d > dueDay ? overdueStage(dueDay, d, false) : overdueStage(dueDay, d, iv.returned);
      const status: BoardStatus = !iv.returned && d > dueDay ? 'overdue' : 'out';
      return {
        asset,
        status,
        activeLoan: loan,
        borrowerInitials: initialsOf(loan.borrowerName),
        dueOn: dueDay,
        bufferEndsOn: iv.bufferEnd,
        overdueStage: stage,
        nextFreeDate: addDays(iv.bufferEnd, 1),
      };
    }

    // In turnaround / reimaging buffer on date d
    if (d > iv.loanEnd && d <= iv.bufferEnd) {
      return {
        asset,
        status: 'reimaging',
        activeLoan: loan,
        borrowerInitials: initialsOf(loan.borrowerName),
        dueOn: dueDay,
        bufferEndsOn: iv.bufferEnd,
        overdueStage: 'none',
        nextFreeDate: addDays(iv.bufferEnd, 1),
      };
    }
  }

  // Otherwise asset is in on date d
  return {
    asset,
    status: 'in',
    activeLoan: null,
    borrowerInitials: null,
    dueOn: null,
    bufferEndsOn: null,
    overdueStage: 'none',
    nextFreeDate: d,
  };
}

export interface KindUtilisation {
  kind: AssetKind;
  assetCount: number;
  loanedDays: number;
  availableDays: number;
  rate: number; // 0..1
}

export function computeUtilisation(
  assets: readonly Asset[],
  loans: readonly Loan[],
  handovers: readonly Handover[],
  windowStart: string,
  windowEnd: string,
): KindUtilisation[] {
  const wStart = toDayStr(windowStart);
  const wEnd = toDayStr(windowEnd);
  const windowDays = Math.max(1, diffDays(wStart, wEnd) + 1);

  const byKind = new Map<AssetKind, { count: number; loaned: number; avail: number }>();
  for (const a of assets) {
    const entry = byKind.get(a.kind) ?? { count: 0, loaned: 0, avail: 0 };
    entry.count += 1;
    if (a.condition !== 'repair') {
      entry.avail += windowDays;
    }
    byKind.set(a.kind, entry);
  }

  for (const loan of loans) {
    const asset = assets.find((a) => a.id === loan.assetId);
    if (!asset) continue;
    const { in: inH } = loanHandovers(loan.id, handovers);
    const lStart = toDayStr(loan.startsOn);
    const lEnd = inH ? toDayStr(inH.at) : toDayStr(loan.dueOn);
    const overlapStart = lStart > wStart ? lStart : wStart;
    const overlapEnd = lEnd < wEnd ? lEnd : wEnd;
    if (overlapEnd >= overlapStart) {
      const days = diffDays(overlapStart, overlapEnd) + 1;
      const entry = byKind.get(asset.kind);
      if (entry) entry.loaned += days;
    }
  }

  return Array.from(byKind.entries()).map(([kind, v]) => ({
    kind,
    assetCount: v.count,
    loanedDays: v.loaned,
    availableDays: v.avail,
    rate: v.avail > 0 ? Math.min(1, v.loaned / v.avail) : 0,
  }));
}
