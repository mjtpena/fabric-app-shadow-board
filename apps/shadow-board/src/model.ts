import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

export type AssetKind = 'laptop' | 'phone' | 'hotspot' | 'headset' | 'security-key' | 'monitor';
export type AssetCondition = 'new' | 'good' | 'worn' | 'repair';
export type LoanPurpose = 'travel' | 'remote' | 'replacement' | 'event';
export type HandoverKind = 'out' | 'in' | 'repair';

export const ASSET_KINDS: AssetKind[] = ['laptop', 'phone', 'hotspot', 'security-key', 'headset', 'monitor'];
export const ASSET_CONDITIONS: AssetCondition[] = ['new', 'good', 'worn', 'repair'];
export const LOAN_PURPOSES: LoanPurpose[] = ['travel', 'remote', 'replacement', 'event'];

export const limits = {
  assetTag: { min: 2, max: 20 },
  assetModel: { min: 2, max: 60 },
  assetKit: { max: 120 },
  borrowerName: { min: 2, max: 100 },
  ticketRef: { max: 30 },
  handoverNote: { max: 200 },
} as const;

export interface Asset {
  id: string;
  custodianSub: string;
  tag: string;
  kind: AssetKind;
  model: string;
  condition: AssetCondition;
  kit: string;
}

export interface Loan {
  id: string;
  assetId: string;
  borrowerSub: string;
  borrowerName: string;
  startsOn: string;
  dueOn: string;
  purpose: LoanPurpose;
  ticketRef: string | null;
  createdAt: string;
}

export interface Handover {
  id: string;
  loanId: string;
  assetId: string;
  custodianSub: string;
  kind: HandoverKind;
  at: string;
  condition: AssetCondition;
  kitOk: boolean;
  note: string | null;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Asset: Asset;
  Loan: Loan;
  Handover: Handover;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Asset: {
    name: 'Asset',
    fields: {
      id: 'uuid',
      custodianSub: 'text',
      tag: 'text',
      kind: 'set',
      model: 'text',
      condition: 'set',
      kit: 'text',
    },
  },
  Loan: {
    name: 'Loan',
    fields: {
      id: 'uuid',
      assetId: 'uuid',
      borrowerSub: 'text',
      borrowerName: 'text',
      startsOn: 'date',
      dueOn: 'date',
      purpose: 'set',
      ticketRef: 'text',
      createdAt: 'date',
    },
  },
  Handover: {
    name: 'Handover',
    fields: {
      id: 'uuid',
      loanId: 'uuid',
      assetId: 'uuid',
      custodianSub: 'text',
      kind: 'set',
      at: 'date',
      condition: 'set',
      kitOk: 'bool',
      note: 'text',
    },
  },
};
