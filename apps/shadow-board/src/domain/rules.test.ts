import { describe, expect, it } from 'vitest';

import type { Asset, Handover, Loan } from '../model';
import {
  addBusinessDays,
  adjustDueForHoliday,
  assetStatusOnDate,
  bestFitAsset,
  bufferEndDate,
  canExtendLoan,
  computeUtilisation,
  evaluateReturn,
  isAssetFree,
  overdueStage,
  validateLoanDates,
} from './rules';

const HOLIDAYS = ['2025-12-25', '2025-12-26', '2026-01-01'];

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a-1',
    custodianSub: 'admin',
    tag: 'LP-01',
    kind: 'laptop',
    model: 'ThinkPad X1',
    condition: 'good',
    kit: 'USB-C charger, Sleeve, Ethernet dongle',
    ...overrides,
  };
}

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'l-1',
    assetId: 'a-1',
    borrowerSub: 'u-1',
    borrowerName: 'Sam Taylor',
    startsOn: '2025-12-15T09:00:00.000Z',
    dueOn: '2025-12-18T17:00:00.000Z',
    purpose: 'travel',
    ticketRef: null,
    createdAt: '2025-12-10T09:00:00.000Z',
    ...overrides,
  };
}

describe('Rule 1: Availability with buffers', () => {
  it('skips weekends and holidays when computing laptop 2-business-day buffer', () => {
    // 2025-12-24 is Wednesday; Dec 25 & 26 are holidays; Dec 27 & 28 weekend
    // Business day 1 = Mon Dec 29, Business day 2 = Tue Dec 30
    expect(addBusinessDays('2025-12-24', 2, HOLIDAYS)).toBe('2025-12-30');
    expect(bufferEndDate('2025-12-24', 'laptop', HOLIDAYS)).toBe('2025-12-30');
    expect(bufferEndDate('2025-12-24', 'phone', HOLIDAYS)).toBe('2025-12-29');
  });

  it('refuses a reservation overlapping another loan return buffer and returns next free date', () => {
    const asset = makeAsset({ id: 'a-1', kind: 'laptop' });
    // Loan ends Thu 2025-12-18 -> 2 business days buffer = Fri Dec 19, Mon Dec 22 -> next free Tue Dec 23
    const loan = makeLoan({ startsOn: '2025-12-15', dueOn: '2025-12-18' });

    const blocked = isAssetFree(asset, [loan], [], '2025-12-22', '2025-12-24', HOLIDAYS);
    expect(blocked.free).toBe(false);
    expect(blocked.nextFreeDate).toBe('2025-12-23');

    const ok = isAssetFree(asset, [loan], [], '2025-12-23', '2025-12-24', HOLIDAYS);
    expect(ok.free).toBe(true);
  });

  it('never marks an asset in repair as free', () => {
    const asset = makeAsset({ condition: 'repair' });
    const res = isAssetFree(asset, [], [], '2025-12-15', '2025-12-17', HOLIDAYS);
    expect(res.free).toBe(false);
    expect(res.nextFreeDate).toBeNull();
  });
});

describe('Rule 2: Best-fit allocation', () => {
  it('chooses the asset with the smallest idle gaps, not the first free', () => {
    // Asset A is completely empty (large gaps: 60 + 60 = 120)
    const aEmpty = makeAsset({ id: 'a-empty', tag: 'LP-01', condition: 'good' });
    // Asset B has a loan ending Dec 10 (buf ends Dec 12) and another starting Dec 22 -> tight gap around Dec 15..17!
    const aTight = makeAsset({ id: 'a-tight', tag: 'LP-02', condition: 'good' });

    const loans: Loan[] = [
      makeLoan({ id: 'l-prev', assetId: 'a-tight', startsOn: '2025-12-08', dueOn: '2025-12-10' }),
      makeLoan({ id: 'l-next', assetId: 'a-tight', startsOn: '2025-12-22', dueOn: '2025-12-24' }),
    ];

    const pick = bestFitAsset(
      [aEmpty, aTight],
      loans,
      [],
      { kind: 'laptop', startsOn: '2025-12-15', dueOn: '2025-12-17', minCondition: 'worn' },
      HOLIDAYS,
    );

    expect(pick?.asset.id).toBe('a-tight');
    expect(pick!.totalGap).toBeLessThan(120);
  });

  it('breaks ties by lowest condition-adequate wear (worn before good before new)', () => {
    const aNew = makeAsset({ id: 'a-new', tag: 'LP-01', condition: 'new' });
    const aWorn = makeAsset({ id: 'a-worn', tag: 'LP-02', condition: 'worn' });

    const pick = bestFitAsset(
      [aNew, aWorn],
      [],
      [],
      { kind: 'laptop', startsOn: '2025-12-15', dueOn: '2025-12-17', minCondition: 'worn' },
      HOLIDAYS,
    );
    expect(pick?.asset.id).toBe('a-worn');
  });
});

describe('Rule 3: Limits and extensions', () => {
  it('enforces 21-day max loan and adjusts holiday-spanning due date to next business day', () => {
    expect(adjustDueForHoliday('2025-12-22', '2025-12-26', HOLIDAYS)).toBe('2025-12-29');

    const tooLong = validateLoanDates('2025-12-01', '2025-12-25', HOLIDAYS);
    expect(tooLong.ok).toBe(false);
  });

  it('blocks extension when a later booking with buffer would clash', () => {
    const asset = makeAsset({ id: 'a-1', kind: 'laptop' });
    const l1 = makeLoan({ id: 'l-1', assetId: 'a-1', startsOn: '2025-12-08', dueOn: '2025-12-10' });
    const l2 = makeLoan({ id: 'l-2', assetId: 'a-1', startsOn: '2025-12-16', dueOn: '2025-12-18' });

    // Extending l1 to Dec 15 -> buffer ends Dec 17 -> clashes with l2 starting Dec 16
    const blocked = canExtendLoan(l1, '2025-12-15', asset, [l1, l2], [], HOLIDAYS);
    expect(blocked.ok).toBe(false);

    // Extending l1 to Dec 11 -> buffer ends Dec 15 (Fri Dec 12, Mon Dec 15) -> free Dec 16 -> OK
    const allowed = canExtendLoan(l1, '2025-12-11', asset, [l1, l2], [], HOLIDAYS);
    expect(allowed.ok).toBe(true);
  });
});

describe('Rule 4: Return inspection', () => {
  it('flags missing charger as needsRepair and lists missing kit', () => {
    const res = evaluateReturn('good', 'good', 'USB-C charger, Sleeve', ['Sleeve']);
    expect(res.needsRepair).toBe(true);
    expect(res.kitOk).toBe(false);
    expect(res.missingKit).toEqual(['USB-C charger']);
  });

  it('flags condition drop as needsRepair even when kit is complete', () => {
    const res = evaluateReturn('good', 'worn', 'USB-C charger, Sleeve', ['USB-C charger', 'Sleeve']);
    expect(res.needsRepair).toBe(true);
    expect(res.conditionDropped).toBe(true);
  });
});

describe('Rule 5: Overdue ladder, board snapshot, and utilisation', () => {
  it('classifies overdue ladder stages accurately', () => {
    expect(overdueStage('2025-12-10', '2025-12-09', false)).toBe('reminder');
    expect(overdueStage('2025-12-10', '2025-12-10', false)).toBe('none');
    expect(overdueStage('2025-12-10', '2025-12-11', false)).toBe('overdue');
    expect(overdueStage('2025-12-10', '2025-12-13', false)).toBe('manager');
    expect(overdueStage('2025-12-10', '2025-12-24', false)).toBe('presumed-lost');
    expect(overdueStage('2025-12-10', '2025-12-24', true)).toBe('none');
  });

  it('transitions asset from out -> reimaging -> in as date moves past buffer', () => {
    const asset = makeAsset({ id: 'a-1', kind: 'phone' }); // 1 business day buffer
    const loan = makeLoan({ id: 'l-1', assetId: 'a-1', startsOn: '2025-12-15', dueOn: '2025-12-17' });
    const handovers: Handover[] = [];

    expect(assetStatusOnDate(asset, [loan], handovers, '2025-12-16', '2025-12-16', HOLIDAYS).status).toBe('out');
    expect(assetStatusOnDate(asset, [loan], handovers, '2025-12-18', '2025-12-16', HOLIDAYS).status).toBe('reimaging');
    expect(assetStatusOnDate(asset, [loan], handovers, '2025-12-19', '2025-12-16', HOLIDAYS).status).toBe('in');
  });

  it('computes utilisation per kind excluding repair assets from available days', () => {
    const a1 = makeAsset({ id: 'a-1', kind: 'laptop', condition: 'good' });
    const a2 = makeAsset({ id: 'a-2', kind: 'laptop', condition: 'repair' });
    const loan = makeLoan({ id: 'l-1', assetId: 'a-1', startsOn: '2025-12-01', dueOn: '2025-12-05' });
    const util = computeUtilisation([a1, a2], [loan], [], '2025-12-01', '2025-12-10');
    expect(util).toHaveLength(1);
    expect(util[0].loanedDays).toBe(5);
    expect(util[0].availableDays).toBe(10);
    expect(util[0].rate).toBeCloseTo(0.5);
  });
});
