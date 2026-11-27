import { AppMarker } from './AppMarker.js';
import { Asset } from './Asset.js';
import { Handover } from './Handover.js';
import { Loan } from './Loan.js';
import { Person } from './Person.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Asset: Asset;
  Loan: Loan;
  Handover: Handover;
};

export const schema = [Person, AppMarker, Asset, Loan, Handover];
