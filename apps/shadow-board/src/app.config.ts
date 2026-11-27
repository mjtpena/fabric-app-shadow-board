/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

export const personas: Persona[] = [
  { sub: 'demo-admin', name: 'Alex Rivera', email: 'alex@example.com', isAdmin: true, role: 'Custodian' },
  { sub: 'demo-borrower', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Borrower' },
  { sub: 'demo-borrower-2', name: 'Priya Patel', email: 'priya@example.com', isAdmin: false, role: 'Borrower' },
];

export const config: AppConfig<Schema> = {
  appId: 'shadow-board',
  title: 'Shadow Board',
  tagline: 'Hardware loaner pool with turnaround buffers',
  accent: 'coral',
  logoPaths: [
    'M3 4h18v16H3z',
    'M7 8h1v1H7z M11.5 8h1v1h-1z M16 8h1v1h-1z',
    'M6 12h5v5H6z',
    'M14 12h4v5h-4z',
  ],
  defs,
  personas,
  seed,
  nav: [
    { to: '/', label: 'Board', end: true },
    { to: '/reserve', label: 'Reserve' },
    { to: '/desk', label: 'Hand-out desk' },
    { to: '/reimage', label: 'Reimage bench' },
    { to: '/audit', label: 'Board audit' },
    { to: '/about', label: 'About' },
  ],
};
