import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import type { Asset, AssetCondition, Handover, Loan, LoanPurpose, Schema } from '../model';
import {
  canExtendLoan,
  evaluateReturn,
  isAssetFree,
  loanHandovers,
  toDayStr,
  validateLoanDates,
} from './rules';

export interface PoolData {
  assets: Asset[];
  loans: Loan[];
  handovers: Handover[];
}

export async function loadPool(store: DataStore<Schema>): Promise<PoolData> {
  const [assets, loans, handovers] = await Promise.all([
    store.repo('Asset').list(),
    store.repo('Loan').list(),
    store.repo('Handover').list(),
  ]);
  return {
    assets: [...assets].sort((a, b) => a.tag.localeCompare(b.tag)),
    loans: [...loans].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    handovers: [...handovers].sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export interface ReserveInput {
  assetId: string;
  startsOn: string;
  dueOn: string;
  purpose: LoanPurpose;
  ticketRef?: string;
}

export async function reserveAsset(
  store: DataStore<Schema>,
  actor: Person,
  input: ReserveInput,
  holidays: readonly string[],
  now: Date = new Date(),
): Promise<Loan> {
  const pool = await loadPool(store);
  const asset = pool.assets.find((a) => a.id === input.assetId);
  if (!asset) throw new RuleError('Asset not found.');

  const dateCheck = validateLoanDates(input.startsOn, input.dueOn, holidays);
  if (!dateCheck.ok) throw new RuleError(dateCheck.error ?? 'Invalid loan dates.');

  const avail = isAssetFree(asset, pool.loans, pool.handovers, input.startsOn, dateCheck.adjustedDueOn, holidays);
  if (!avail.free) {
    const hint = avail.nextFreeDate ? ` Next free date: ${avail.nextFreeDate}.` : '';
    throw new RuleError(`${avail.reason ?? 'Asset is not available.'}${hint}`);
  }

  return store.repo('Loan').create({
    assetId: asset.id,
    borrowerSub: actor.sub,
    borrowerName: actor.displayName,
    startsOn: new Date(`${toDayStr(input.startsOn)}T09:00:00.000Z`).toISOString(),
    dueOn: new Date(`${dateCheck.adjustedDueOn}T17:00:00.000Z`).toISOString(),
    purpose: input.purpose,
    ticketRef: input.ticketRef?.trim() || null,
    createdAt: now.toISOString(),
  });
}

export async function extendLoan(
  store: DataStore<Schema>,
  actor: Person,
  loanId: string,
  newDueOn: string,
  holidays: readonly string[],
): Promise<Loan> {
  const pool = await loadPool(store);
  const loan = pool.loans.find((l) => l.id === loanId);
  if (!loan) throw new RuleError('Loan not found.');
  if (loan.borrowerSub !== actor.sub && !actor.isAdmin) {
    throw new PermissionError('Only the borrower or custodian can extend this loan.');
  }
  const { in: inH } = loanHandovers(loan.id, pool.handovers);
  if (inH) throw new RuleError('Cannot extend a loan that has already been returned.');

  const asset = pool.assets.find((a) => a.id === loan.assetId);
  if (!asset) throw new RuleError('Asset not found.');

  const check = canExtendLoan(loan, newDueOn, asset, pool.loans, pool.handovers, holidays);
  if (!check.ok) throw new RuleError(check.error ?? 'Cannot extend loan.');

  return store.repo('Loan').update(loan.id, {
    dueOn: new Date(`${check.adjustedDueOn}T17:00:00.000Z`).toISOString(),
  });
}

export async function cancelLoan(
  store: DataStore<Schema>,
  actor: Person,
  loanId: string,
): Promise<void> {
  const pool = await loadPool(store);
  const loan = pool.loans.find((l) => l.id === loanId);
  if (!loan) throw new RuleError('Loan not found.');
  if (loan.borrowerSub !== actor.sub && !actor.isAdmin) {
    throw new PermissionError('Only the borrower or custodian can cancel this reservation.');
  }
  const { out: outH } = loanHandovers(loan.id, pool.handovers);
  if (outH) {
    throw new RuleError('Cannot cancel or edit a loan once it has been handed out.');
  }
  await store.repo('Loan').remove(loan.id);
}

export async function handOutLoan(
  store: DataStore<Schema>,
  actor: Person,
  loanId: string,
  condition: AssetCondition,
  note?: string,
  now: Date = new Date(),
): Promise<Handover> {
  if (!actor.isAdmin) throw new PermissionError('Only the custodian can hand out equipment.');
  const pool = await loadPool(store);
  const loan = pool.loans.find((l) => l.id === loanId);
  if (!loan) throw new RuleError('Loan not found.');
  const { out: outH } = loanHandovers(loan.id, pool.handovers);
  if (outH) throw new RuleError('This loan has already been handed out.');

  return store.repo('Handover').create({
    loanId: loan.id,
    assetId: loan.assetId,
    custodianSub: actor.sub,
    kind: 'out',
    at: now.toISOString(),
    condition,
    kitOk: true,
    note: note?.trim() || null,
  });
}

export async function returnLoan(
  store: DataStore<Schema>,
  actor: Person,
  loanId: string,
  returnCondition: AssetCondition,
  returnedKit: readonly string[],
  note?: string,
  now: Date = new Date(),
): Promise<{ handover: Handover; sentToRepair: boolean; missingKit: string[] }> {
  if (!actor.isAdmin) throw new PermissionError('Only the custodian can check in equipment.');
  const pool = await loadPool(store);
  const loan = pool.loans.find((l) => l.id === loanId);
  if (!loan) throw new RuleError('Loan not found.');
  const asset = pool.assets.find((a) => a.id === loan.assetId);
  if (!asset) throw new RuleError('Asset not found.');

  const { out: outH, in: inH } = loanHandovers(loan.id, pool.handovers);
  if (inH) throw new RuleError('This loan has already been checked in.');

  const baselineCondition = outH ? outH.condition : asset.condition;
  const inspection = evaluateReturn(baselineCondition, returnCondition, asset.kit, returnedKit);

  const autoNote =
    !inspection.kitOk
      ? `Missing kit: ${inspection.missingKit.join(', ')}${note?.trim() ? ` — ${note.trim()}` : ''}`
      : note?.trim() || null;

  const handover = await store.repo('Handover').create({
    loanId: loan.id,
    assetId: asset.id,
    custodianSub: actor.sub,
    kind: 'in',
    at: now.toISOString(),
    condition: inspection.needsRepair ? 'repair' : returnCondition,
    kitOk: inspection.kitOk,
    note: autoNote ? autoNote.slice(0, 200) : null,
  });

  if (inspection.needsRepair) {
    await store.repo('Asset').update(asset.id, { condition: 'repair' });
  } else if (returnCondition !== asset.condition) {
    await store.repo('Asset').update(asset.id, { condition: returnCondition });
  }

  return { handover, sentToRepair: inspection.needsRepair, missingKit: inspection.missingKit };
}

export async function completeRepair(
  store: DataStore<Schema>,
  actor: Person,
  assetId: string,
  restoredCondition: Exclude<AssetCondition, 'repair'>,
  note?: string,
  now: Date = new Date(),
): Promise<Handover> {
  if (!actor.isAdmin) throw new PermissionError('Only the custodian can clear repairs.');
  const pool = await loadPool(store);
  const asset = pool.assets.find((a) => a.id === assetId);
  if (!asset) throw new RuleError('Asset not found.');
  if (asset.condition !== 'repair') throw new RuleError('Asset is not in repair.');

  const lastLoan = [...pool.loans].reverse().find((l) => l.assetId === asset.id);
  const handover = await store.repo('Handover').create({
    loanId: lastLoan?.id ?? asset.id,
    assetId: asset.id,
    custodianSub: actor.sub,
    kind: 'repair',
    at: now.toISOString(),
    condition: restoredCondition,
    kitOk: true,
    note: note?.trim() || 'Repair completed and kit verified',
  });

  await store.repo('Asset').update(asset.id, { condition: restoredCondition });
  return handover;
}
